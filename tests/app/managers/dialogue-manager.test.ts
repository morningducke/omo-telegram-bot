import { afterEach, describe, expect, it } from "vitest";
import {
  DIALOGUE_CHUNK_CHAR_LIMIT,
  dialogueManager,
  formatDialogueTranscriptText,
} from "../../../src/app/managers/dialogue-manager.js";

afterEach(() => {
  dialogueManager.end();
});

describe("app/managers/dialogue-manager", () => {
  describe("rendering", () => {
    it("renders only the header before any turn", () => {
      dialogueManager.start(1, "sess", 100, "💬 Dialogue");
      expect(dialogueManager.render()).toBe("💬 Dialogue");
    });

    it("renders a prompt with the ❯ marker and no reply line when reply is empty", () => {
      dialogueManager.start(1, "sess", 100, "💬 Dialogue");
      dialogueManager.addPrompt("fix the bug");
      expect(dialogueManager.render()).toBe("💬 Dialogue\n\n❯ fix the bug");
    });

    it("renders prompt + reply separated by a newline once a reply streams in", () => {
      dialogueManager.start(1, "sess", 100, "💬 Dialogue");
      dialogueManager.addPrompt("fix the bug");
      dialogueManager.updateLastReply("Done.");
      expect(dialogueManager.render()).toBe("💬 Dialogue\n\n❯ fix the bug\nDone.");
    });

    it("separates multiple turns with blank lines", () => {
      dialogueManager.start(1, "sess", 100, "💬 Dialogue");
      dialogueManager.addPrompt("first");
      dialogueManager.updateLastReply("reply 1");
      dialogueManager.addPrompt("second");
      dialogueManager.updateLastReply("reply 2");
      expect(dialogueManager.render()).toBe(
        "💬 Dialogue\n\n❯ first\nreply 1\n\n❯ second\nreply 2",
      );
    });
  });

  describe("state queries", () => {
    it("isActive toggles with start/end", () => {
      expect(dialogueManager.isActive()).toBe(false);
      dialogueManager.start(1, "sess", 100, "h");
      expect(dialogueManager.isActive()).toBe(true);
      dialogueManager.end();
      expect(dialogueManager.isActive()).toBe(false);
    });

    it("matchesSession only after start", () => {
      expect(dialogueManager.matchesSession("sess")).toBe(false);
      dialogueManager.start(1, "sess", 100, "h");
      expect(dialogueManager.matchesSession("sess")).toBe(true);
      expect(dialogueManager.matchesSession("other")).toBe(false);
    });

    it("getTranscriptMessageId reflects rollover", () => {
      dialogueManager.start(1, "sess", 100, "h");
      expect(dialogueManager.getTranscriptMessageId()).toBe(100);
      dialogueManager.rollover(200, "💬 Dialogue (cont.)");
      expect(dialogueManager.getTranscriptMessageId()).toBe(200);
    });
  });

  describe("overflow detection", () => {
    it("never reports overflow for the first turn", () => {
      dialogueManager.start(1, "sess", 100, "h");
      expect(dialogueManager.wouldOverflowWithPrompt("x".repeat(5000))).toBe(false);
    });

    it("reports overflow when an added prompt would exceed the chunk limit", () => {
      dialogueManager.start(1, "sess", 100, "h");
      const bigReply = "y".repeat(DIALOGUE_CHUNK_CHAR_LIMIT);
      dialogueManager.addPrompt("first");
      dialogueManager.updateLastReply(bigReply);
      expect(dialogueManager.wouldOverflowWithPrompt("next prompt")).toBe(true);
    });

    it("does not report overflow when there is headroom", () => {
      dialogueManager.start(1, "sess", 100, "h");
      dialogueManager.addPrompt("first");
      dialogueManager.updateLastReply("short");
      expect(dialogueManager.wouldOverflowWithPrompt("second")).toBe(false);
    });
  });

  describe("rollover", () => {
    it("resets turns and switches to the new message id while keeping the session", () => {
      dialogueManager.start(1, "sess", 100, "💬 Dialogue");
      dialogueManager.addPrompt("first");
      dialogueManager.updateLastReply("reply 1");
      dialogueManager.rollover(200, "💬 Dialogue (cont.)");
      expect(dialogueManager.getTranscriptMessageId()).toBe(200);
      expect(dialogueManager.matchesSession("sess")).toBe(true);
      expect(dialogueManager.render()).toBe("💬 Dialogue (cont.)");
    });
  });

  describe("reply streaming", () => {
    it("updateLastReply mutates only the last turn", () => {
      dialogueManager.start(1, "sess", 100, "h");
      dialogueManager.addPrompt("a");
      dialogueManager.addPrompt("b");
      dialogueManager.updateLastReply("reply-b");
      const text = dialogueManager.render();
      expect(text).toContain("❯ a");
      expect(text).not.toMatch(/❯ a\nreply-b/);
      expect(text).toContain("❯ b\nreply-b");
    });

    it("updateLastReply is a no-op when there are no turns", () => {
      dialogueManager.start(1, "sess", 100, "h");
      dialogueManager.updateLastReply("orphan");
      expect(dialogueManager.render()).toBe("h");
    });

    it("hasPendingReply reflects whether the last turn has a reply", () => {
      dialogueManager.start(1, "sess", 100, "h");
      expect(dialogueManager.hasPendingReply()).toBe(false);
      dialogueManager.addPrompt("a");
      expect(dialogueManager.hasPendingReply()).toBe(false);
      dialogueManager.updateLastReply("r");
      expect(dialogueManager.hasPendingReply()).toBe(true);
    });
  });

  describe("formatDialogueTranscriptText (pure helper)", () => {
    it("joins header + turns identically to manager.render", () => {
      const header = "💬 Dialogue";
      const turns = [
        { prompt: "p1", reply: "r1" },
        { prompt: "p2", reply: "" },
      ];
      expect(formatDialogueTranscriptText(header, turns)).toBe(
        "💬 Dialogue\n\n❯ p1\nr1\n\n❯ p2",
      );
    });
  });
});
