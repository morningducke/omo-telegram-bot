import type { Context } from "grammy";
import { config } from "../../config.js";
import type { InteractionState } from "../../app/types/interaction.js";
import { interactionManager } from "../../app/managers/interaction-manager.js";
import type { UserMessageItem } from "../../app/services/message-history-service.js";
import { isForegroundBusy } from "../../app/services/run-control-service.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { replyBusyBlocked } from "../messages/busy-blocked-renderer.js";
import {
  buildRepliesListKeyboard,
  buildReplyDetailKeyboard,
  calculateRepliesPaginationRange,
  formatRepliesSelectText,
  formatReplyDetailText,
  parseReplyPageCallback,
  parseReplySelectCallback,
  REPLIES_CALLBACK_BACK,
  REPLIES_CALLBACK_CANCEL,
  REPLIES_CALLBACK_PREFIX,
} from "../menus/replies-menu.js";

function getCallbackMessageId(ctx: Context): number | null {
  const message = ctx.callbackQuery?.message;
  if (!message || !("message_id" in message)) {
    return null;
  }

  const messageId = (message as { message_id?: number }).message_id;
  return typeof messageId === "number" ? messageId : null;
}

function parseReplies(value: unknown): UserMessageItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const replies: UserMessageItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const id = (item as { id?: unknown }).id;
    const text = (item as { text?: unknown }).text;
    const created = (item as { created?: unknown }).created;

    if (typeof id !== "string" || typeof text !== "string" || typeof created !== "number") {
      return null;
    }

    replies.push({ id, text, created });
  }

  return replies;
}

interface RepliesListMetadata {
  flow: "replies";
  stage: "list";
  messageId: number;
  projectDirectory: string;
  sessionId: string;
  replies: UserMessageItem[];
  page: number;
}

interface RepliesDetailMetadata {
  flow: "replies";
  stage: "detail";
  messageId: number;
  projectDirectory: string;
  sessionId: string;
  replies: UserMessageItem[];
  page: number;
  selectedIndex: number;
}

type RepliesMetadata = RepliesListMetadata | RepliesDetailMetadata;

function parseRepliesMetadata(state: InteractionState | null): RepliesMetadata | null {
  if (!state || state.kind !== "custom") {
    return null;
  }

  const flow = state.metadata.flow;
  const stage = state.metadata.stage;
  const messageId = state.metadata.messageId;
  const projectDirectory = state.metadata.projectDirectory;
  const sessionId = state.metadata.sessionId;
  const replies = parseReplies(state.metadata.replies);
  const page =
    typeof state.metadata.page === "number" && Number.isInteger(state.metadata.page)
      ? Math.max(0, state.metadata.page)
      : 0;

  if (
    flow !== "replies" ||
    typeof messageId !== "number" ||
    typeof projectDirectory !== "string" ||
    typeof sessionId !== "string" ||
    !replies
  ) {
    return null;
  }

  if (stage === "list") {
    return { flow, stage, messageId, projectDirectory, sessionId, replies, page };
  }

  if (stage === "detail") {
    const selectedIndex = state.metadata.selectedIndex;
    if (typeof selectedIndex !== "number" || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return null;
    }

    return { flow, stage, messageId, projectDirectory, sessionId, replies, page, selectedIndex };
  }

  return null;
}

function clearRepliesInteraction(reason: string): void {
  const metadata = parseRepliesMetadata(interactionManager.getSnapshot());
  if (metadata) {
    interactionManager.clear(reason);
  }
}

export async function handleRepliesCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith(REPLIES_CALLBACK_PREFIX)) {
    return false;
  }

  if (isForegroundBusy()) {
    await replyBusyBlocked(ctx);
    return true;
  }

  const metadata = parseRepliesMetadata(interactionManager.getSnapshot());
  const callbackMessageId = getCallbackMessageId(ctx);

  if (!metadata || callbackMessageId === null || metadata.messageId !== callbackMessageId) {
    await ctx.answerCallbackQuery({ text: t("messages.inactive_callback"), show_alert: true });
    return true;
  }

  try {
    if (data === REPLIES_CALLBACK_BACK) {
      if (metadata.stage !== "detail") {
        await ctx.answerCallbackQuery({ text: t("messages.inactive_callback"), show_alert: true });
        return true;
      }

      const pageSize = config.bot.messagesListLimit;
      const { page: normalizedPage } = calculateRepliesPaginationRange(
        metadata.replies.length,
        metadata.page,
        pageSize,
      );
      await ctx.editMessageText(formatRepliesSelectText(normalizedPage), {
        reply_markup: buildRepliesListKeyboard(metadata.replies, normalizedPage, pageSize),
      });
      await ctx.answerCallbackQuery();

      interactionManager.transition({
        expectedInput: "callback",
        metadata: {
          flow: "replies",
          stage: "list",
          messageId: metadata.messageId,
          projectDirectory: metadata.projectDirectory,
          sessionId: metadata.sessionId,
          replies: metadata.replies,
          page: normalizedPage,
        },
      });

      return true;
    }

    if (data === REPLIES_CALLBACK_CANCEL) {
      clearRepliesInteraction("replies_cancelled");
      await ctx.answerCallbackQuery({ text: t("messages.cancelled_callback") });
      await ctx.deleteMessage().catch(() => {});
      return true;
    }

    const page = parseReplyPageCallback(data);
    if (page !== null) {
      if (metadata.stage !== "list") {
        await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
        return true;
      }

      const pageSize = config.bot.messagesListLimit;
      const { page: normalizedPage, totalPages } = calculateRepliesPaginationRange(
        metadata.replies.length,
        page,
        pageSize,
      );

      if (page >= totalPages || page < 0) {
        await ctx.answerCallbackQuery({ text: t("messages.page_empty_callback") });
        return true;
      }

      await ctx.editMessageText(formatRepliesSelectText(normalizedPage), {
        reply_markup: buildRepliesListKeyboard(metadata.replies, normalizedPage, pageSize),
      });
      await ctx.answerCallbackQuery();

      interactionManager.transition({
        expectedInput: "callback",
        metadata: {
          flow: "replies",
          stage: "list",
          messageId: metadata.messageId,
          projectDirectory: metadata.projectDirectory,
          sessionId: metadata.sessionId,
          replies: metadata.replies,
          page: normalizedPage,
        },
      });

      return true;
    }

    const replyIndex = parseReplySelectCallback(data);
    if (replyIndex === null || metadata.stage !== "list") {
      await ctx.answerCallbackQuery({ text: t("callback.processing_error"), show_alert: true });
      return true;
    }

    const selectedReply = metadata.replies[replyIndex];
    if (!selectedReply) {
      await ctx.answerCallbackQuery({ text: t("messages.inactive_callback"), show_alert: true });
      return true;
    }

    await ctx.editMessageText(formatReplyDetailText(selectedReply), {
      reply_markup: buildReplyDetailKeyboard(),
    });
    await ctx.answerCallbackQuery();

    interactionManager.transition({
      expectedInput: "callback",
      metadata: {
        flow: "replies",
        stage: "detail",
        messageId: metadata.messageId,
        projectDirectory: metadata.projectDirectory,
        sessionId: metadata.sessionId,
        replies: metadata.replies,
        page: metadata.page,
        selectedIndex: replyIndex,
      },
    });

    return true;
  } catch (error) {
    logger.error("[Replies] Error handling replies callback:", error);
    clearRepliesInteraction("replies_callback_error");
    await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
    return true;
  }
}
