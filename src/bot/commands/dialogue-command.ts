import type { CommandContext, Context } from "grammy";
import { dialogueManager } from "../../app/managers/dialogue-manager.js";
import { getCurrentSession } from "../../app/services/session-service.js";
import { isForegroundBusy } from "../../app/services/run-control-service.js";
import { getCurrentProject } from "../../app/stores/settings-store.js";
import { t } from "../../i18n/index.js";
import { replyBusyBlocked } from "../messages/busy-blocked-renderer.js";
import { endDialogue } from "../streaming/transcript-renderer.js";

export async function dialogueCommand(ctx: CommandContext<Context>): Promise<void> {
  if (isForegroundBusy()) {
    await replyBusyBlocked(ctx);
    return;
  }

  if (dialogueManager.isActive()) {
    await ctx.reply(t("dialogue.already_active"));
    return;
  }

  const currentProject = getCurrentProject();
  if (!currentProject) {
    await ctx.reply(t("messages.project_not_selected"));
    return;
  }

  const currentSession = getCurrentSession();
  if (!currentSession || currentSession.directory !== currentProject.worktree) {
    await ctx.reply(t("messages.session_not_selected"));
    return;
  }

  const header = t("dialogue.header");
  const sent = await ctx.reply(header);
  dialogueManager.start(ctx.chat!.id, currentSession.id, sent.message_id, header);
  await ctx.reply(t("dialogue.started_hint"));
}

export async function endDialogueCommand(ctx: CommandContext<Context>): Promise<void> {
  if (!dialogueManager.isActive()) {
    await ctx.reply(t("dialogue.not_active"));
    return;
  }

  endDialogue();
  await ctx.reply(t("dialogue.ended"));
}
