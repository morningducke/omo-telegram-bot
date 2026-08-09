import type { Api } from "grammy";
import { config } from "../../config.js";
import { dialogueManager } from "../../app/managers/dialogue-manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";

interface PendingFlush {
  text: string;
  timer: NodeJS.Timeout | null;
}

let pending: PendingFlush | null = null;

function clearPending(): void {
  if (pending?.timer) {
    clearTimeout(pending.timer);
  }
  pending = null;
}

async function editTranscript(api: Api, chatId: number, messageId: number, text: string): Promise<void> {
  try {
    await api.editMessageText(chatId, messageId, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("message is not modified")) {
      return;
    }
    logger.debug("[Dialogue] editMessageText failed:", message);
  }
}

export function isDialogueStreamActiveForSession(sessionId: string): boolean {
  return dialogueManager.isActive() && dialogueManager.matchesSession(sessionId);
}

export async function handleDialoguePrompt(
  api: Api,
  chatId: number,
  sessionId: string,
  prompt: string,
): Promise<void> {
  if (!dialogueManager.isActive() || !dialogueManager.matchesSession(sessionId)) {
    return;
  }

  flushPendingNow(api, chatId);

  if (dialogueManager.wouldOverflowWithPrompt(prompt)) {
    const continuationHeader = t("dialogue.continuation");
    try {
      const sent = await api.sendMessage(chatId, continuationHeader);
      dialogueManager.rollover(sent.message_id, continuationHeader);
    } catch (err) {
      logger.error("[Dialogue] Failed to start new transcript chunk:", err);
      return;
    }
  }

  dialogueManager.addPrompt(prompt);
  const messageId = dialogueManager.getTranscriptMessageId();
  if (messageId !== null) {
    await editTranscript(api, chatId, messageId, dialogueManager.render());
  }
}

export function streamDialogueReply(
  api: Api,
  chatId: number,
  sessionId: string,
  replyText: string,
): void {
  if (!dialogueManager.isActive() || !dialogueManager.matchesSession(sessionId)) {
    return;
  }

  dialogueManager.updateLastReply(replyText);
  scheduleFlush(api, chatId);
}

function scheduleFlush(api: Api, chatId: number): void {
  const text = dialogueManager.render();
  if (!pending) {
    pending = { text, timer: null };
  } else {
    pending.text = text;
  }

  if (!pending.timer) {
    pending.timer = setTimeout(() => {
      flushPendingNow(api, chatId);
    }, config.bot.responseStreamThrottleMs);
  }
}

function flushPendingNow(api: Api, chatId: number): void {
  if (!pending) {
    return;
  }

  const text = pending.text;
  clearPending();

  const messageId = dialogueManager.getTranscriptMessageId();
  if (messageId !== null) {
    void editTranscript(api, chatId, messageId, text);
  }
}

export function finalizeDialogueReply(api: Api, chatId: number, sessionId: string): void {
  if (!dialogueManager.isActive() || !dialogueManager.matchesSession(sessionId)) {
    return;
  }

  flushPendingNow(api, chatId);
}

export function endDialogue(): void {
  clearPending();
  dialogueManager.end();
}
