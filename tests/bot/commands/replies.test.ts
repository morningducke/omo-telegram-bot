import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { repliesCommand } from "../../../src/bot/commands/replies-command.js";
import { interactionManager } from "../../../src/app/managers/interaction-manager.js";
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
  sessionMessagesMock: vi.fn(),
}));

vi.mock("../../../src/app/stores/settings-store.js", () => ({
  getCurrentProject: vi.fn(() => mocked.currentProject),
}));

vi.mock("../../../src/app/services/session-service.js", () => ({
  getCurrentSession: vi.fn(() => mocked.currentSession),
}));

vi.mock("../../../src/app/services/run-control-service.js", () => ({
  isForegroundBusy: vi.fn(() => false),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      messages: mocked.sessionMessagesMock,
    },
  },
}));

function createCommandContext(messageId: number): Context {
  return {
    chat: { id: 777 },
    reply: vi.fn().mockResolvedValue({ message_id: messageId }),
  } as unknown as Context;
}

function makeAssistantMessage(id: string, text: string, created: number, summary = false) {
  return {
    info: {
      id,
      role: "assistant",
      summary,
      time: { created },
    },
    parts: [{ type: "text", text }],
  };
}

function makeUserMessage(id: string, text: string, created: number) {
  return {
    info: {
      id,
      role: "user",
      time: { created },
    },
    parts: [{ type: "text", text }],
  };
}

describe("bot/commands/replies", () => {
  beforeEach(() => {
    mocked.currentProject = { id: "project-1", worktree: "D:\\Projects\\Repo" };
    mocked.currentSession = {
      id: "session-1",
      title: "Session",
      directory: "D:\\Projects\\Repo",
    };
    mocked.sessionMessagesMock.mockReset();
    interactionManager.clear("test_reset");
  });

  it("shows assistant replies newest first and excludes user messages and summaries", async () => {
    const olderTime = new Date(2026, 4, 30, 10, 0).getTime();
    const newerTime = new Date(2026, 4, 30, 14, 0).getTime();

    mocked.sessionMessagesMock.mockResolvedValue({
      data: [
        makeUserMessage("user-1", "a user prompt", olderTime),
        makeAssistantMessage("old-reply", "Here is the fix.", olderTime + 1),
        makeAssistantMessage("summary-1", "Session summary", olderTime + 2, true),
        makeAssistantMessage("new-reply", "Updated approach with tests.", newerTime),
      ],
      error: null,
    });

    const ctx = createCommandContext(300);
    await repliesCommand(ctx as never);

    const [, options] = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { reply_markup: { inline_keyboard: Array<Array<{ callback_data?: string; text: string }>> } },
    ];

    expect(options.reply_markup.inline_keyboard[0]?.[0]?.text).toContain("Updated approach with tests.");
    expect(options.reply_markup.inline_keyboard[1]?.[0]?.text).toContain("Here is the fix.");
    expect(options.reply_markup.inline_keyboard[2]?.[0]?.callback_data).toBe("replies:cancel");

    const state = interactionManager.getSnapshot();
    expect(state?.metadata.replies).toEqual([
      { id: "new-reply", text: "Updated approach with tests.", created: newerTime },
      { id: "old-reply", text: "Here is the fix.", created: olderTime + 1 },
    ]);
  });

  it("shows empty state when there are no assistant replies", async () => {
    mocked.sessionMessagesMock.mockResolvedValue({
      data: [makeUserMessage("user-1", "just a prompt", 1)],
      error: null,
    });

    const ctx = createCommandContext(301);
    await repliesCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("replies.empty"));
  });
});
