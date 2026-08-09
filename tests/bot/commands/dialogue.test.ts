import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { dialogueCommand, endDialogueCommand } from "../../../src/bot/commands/dialogue-command.js";
import { dialogueManager } from "../../../src/app/managers/dialogue-manager.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  currentProject: {
    id: "project-1",
    worktree: "D:\\Projects\\Repo",
  } as { id: string; worktree: string } | null,
  currentSession: {
    id: "session-1",
    title: "Session",
    directory: "D:\\Projects\\Repo",
  } as { id: string; title: string; directory: string } | null,
  isForegroundBusy: false,
}));

vi.mock("../../../src/app/stores/settings-store.js", () => ({
  getCurrentProject: vi.fn(() => mocked.currentProject),
}));

vi.mock("../../../src/app/services/session-service.js", () => ({
  getCurrentSession: vi.fn(() => mocked.currentSession),
}));

vi.mock("../../../src/app/services/run-control-service.js", () => ({
  isForegroundBusy: vi.fn(() => mocked.isForegroundBusy),
}));

vi.mock("../../../src/bot/streaming/transcript-renderer.js", () => ({
  endDialogue: vi.fn(() => dialogueManager.end()),
}));

function createCommandContext(): Context {
  return {
    chat: { id: 42 },
    reply: vi.fn().mockResolvedValue({ message_id: 500 }),
  } as unknown as Context;
}

describe("bot/commands/dialogue", () => {
  beforeEach(() => {
    mocked.currentProject = { id: "project-1", worktree: "D:\\Projects\\Repo" };
    mocked.currentSession = {
      id: "session-1",
      title: "Session",
      directory: "D:\\Projects\\Repo",
    };
    mocked.isForegroundBusy = false;
    dialogueManager.end();
  });

  afterEach(() => {
    dialogueManager.end();
  });

  it("starts dialogue mode and seeds the transcript message", async () => {
    const replyMock = vi.fn().mockResolvedValue({ message_id: 777 });
    const ctx = { chat: { id: 42 }, reply: replyMock } as unknown as Context;

    await dialogueCommand(ctx as never);

    expect(dialogueManager.isActive()).toBe(true);
    expect(dialogueManager.matchesSession("session-1")).toBe(true);
    expect(dialogueManager.getTranscriptMessageId()).toBe(777);
    expect(dialogueManager.render()).toBe(t("dialogue.header"));
  });

  it("refuses to start when no project is selected", async () => {
    mocked.currentProject = null;
    const ctx = createCommandContext();

    await dialogueCommand(ctx as never);

    expect(dialogueManager.isActive()).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(t("messages.project_not_selected"));
  });

  it("refuses to start when no session is selected", async () => {
    mocked.currentSession = null;
    const ctx = createCommandContext();

    await dialogueCommand(ctx as never);

    expect(dialogueManager.isActive()).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(t("messages.session_not_selected"));
  });

  it("refuses to start a second dialogue while one is active", async () => {
    const firstReply = vi.fn().mockResolvedValue({ message_id: 1 });
    await dialogueCommand({ chat: { id: 42 }, reply: firstReply } as never);
    expect(dialogueManager.isActive()).toBe(true);

    const ctx = createCommandContext();
    await dialogueCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("dialogue.already_active"));
  });

  it("ends dialogue mode via /end", async () => {
    const startReply = vi.fn().mockResolvedValue({ message_id: 7 });
    await dialogueCommand({ chat: { id: 42 }, reply: startReply } as never);
    expect(dialogueManager.isActive()).toBe(true);

    await endDialogueCommand(createCommandContext() as never);

    expect(dialogueManager.isActive()).toBe(false);
  });

  it("replies with not_active when /end is used without an active dialogue", async () => {
    const ctx = createCommandContext();
    await endDialogueCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(t("dialogue.not_active"));
  });
});
