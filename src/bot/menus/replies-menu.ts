import { InlineKeyboard } from "grammy";
import type { UserMessageItem } from "../../app/services/message-history-service.js";
import {
  calculateMessagesPaginationRange,
  truncateMessageHistoryText,
} from "./message-history-menu.js";
import { t } from "../../i18n/index.js";

export const calculateRepliesPaginationRange = calculateMessagesPaginationRange;

export const REPLIES_CALLBACK_PREFIX = "replies:";
export const REPLIES_CALLBACK_SELECT_PREFIX = `${REPLIES_CALLBACK_PREFIX}select:`;
const REPLIES_CALLBACK_PAGE_PREFIX = `${REPLIES_CALLBACK_PREFIX}page:`;
export const REPLIES_CALLBACK_BACK = `${REPLIES_CALLBACK_PREFIX}back`;
export const REPLIES_CALLBACK_CANCEL = `${REPLIES_CALLBACK_PREFIX}cancel`;

const MAX_INLINE_BUTTON_LABEL_LENGTH = 64;
const TELEGRAM_MESSAGE_LIMIT = 4096;

function normalizeButtonText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatReplyTime(created: number): string {
  const date = new Date(created);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatReplyButtonLabel(reply: UserMessageItem): string {
  const prefix = `[${formatReplyTime(reply.created)}] `;
  const text = normalizeButtonText(reply.text);
  return `${prefix}${truncateMessageHistoryText(text, MAX_INLINE_BUTTON_LABEL_LENGTH - prefix.length)}`;
}

export function formatRepliesSelectText(page: number): string {
  if (page === 0) {
    return t("replies.select");
  }

  return t("replies.select_page", { page: page + 1 });
}

export function formatReplyDetailText(reply: UserMessageItem): string {
  const prefix = `[${formatReplyTime(reply.created)}]\n\n`;
  return truncateMessageHistoryText(`${prefix}${reply.text}`, TELEGRAM_MESSAGE_LIMIT);
}

export function buildReplyPageCallback(page: number): string {
  return `${REPLIES_CALLBACK_PAGE_PREFIX}${page}`;
}

export function parseReplyPageCallback(data: string): number | null {
  if (!data.startsWith(REPLIES_CALLBACK_PAGE_PREFIX)) {
    return null;
  }

  const rawPage = data.slice(REPLIES_CALLBACK_PAGE_PREFIX.length);
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 0) {
    return null;
  }

  return page;
}

export function parseReplySelectCallback(data: string): number | null {
  if (!data.startsWith(REPLIES_CALLBACK_SELECT_PREFIX)) {
    return null;
  }

  const rawIndex = data.slice(REPLIES_CALLBACK_SELECT_PREFIX.length);
  const index = Number(rawIndex);

  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  return index;
}

export function buildRepliesListKeyboard(
  replies: UserMessageItem[],
  page: number,
  pageSize: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const {
    page: normalizedPage,
    totalPages,
    startIndex,
    endIndex,
  } = calculateMessagesPaginationRange(replies.length, page, pageSize);

  replies.slice(startIndex, endIndex).forEach((reply, index) => {
    const globalIndex = startIndex + index;
    keyboard.text(formatReplyButtonLabel(reply), `${REPLIES_CALLBACK_SELECT_PREFIX}${globalIndex}`).row();
  });

  if (totalPages > 1) {
    if (normalizedPage > 0) {
      keyboard.text(t("replies.button.prev_page"), buildReplyPageCallback(normalizedPage - 1));
    }

    if (normalizedPage < totalPages - 1) {
      keyboard.text(t("replies.button.next_page"), buildReplyPageCallback(normalizedPage + 1));
    }

    keyboard.row();
  }

  keyboard.text(t("replies.button.cancel"), REPLIES_CALLBACK_CANCEL);
  return keyboard;
}

export function buildReplyDetailKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("replies.button.back"), REPLIES_CALLBACK_BACK)
    .row()
    .text(t("replies.button.cancel"), REPLIES_CALLBACK_CANCEL);
}
