import { describe, expect, it } from "vitest";
import { isHarnessMessage, type HarnessMessageLike } from "../../src/utils/harness-filter.js";

function textMessage(text: string, extra: { metadata?: Record<string, unknown> } = {}): HarnessMessageLike {
  return {
    parts: [{ type: "text", text, ...(extra.metadata ? { metadata: extra.metadata } : {}) }],
  };
}

describe("utils/harness-filter", () => {
  describe("detects harness-injected messages", () => {
    it("flags a TODO-continuation directive", () => {
      const msg = textMessage(
        "[SYSTEM DIRECTIVE: OH-MY-OPENCODE - TODO CONTINUATION]\n\nIncomplete tasks remain.\n<!-- OMO_INTERNAL_INITIATOR -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a ralph-loop continuation directive", () => {
      const msg = textMessage(
        "[SYSTEM DIRECTIVE: OH-MY-OPENCODE - RALPH LOOP 2/10] Keep iterating.\n<!-- OMO_INTERNAL_INITIATOR -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a boulder-continuation directive", () => {
      const msg = textMessage(
        "[SYSTEM DIRECTIVE: OH-MY-OPENCODE - BOULDER CONTINUATION]\nProceed with the next module.\n<!-- OMO_INTERNAL_INITIATOR -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a compaction-context directive", () => {
      const msg = textMessage(
        "[SYSTEM DIRECTIVE: OH-MY-OPENCODE - COMPACTION CONTEXT]\nRestored summary.\n<!-- OMO_INTERNAL_INITIATOR -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags an ultrawork-prefixed directive (ralph/ultrawork variant)", () => {
      const msg = textMessage(
        "ultrawork [SYSTEM DIRECTIVE: OH-MY-OPENCODE - ULTRAWORK LOOP VERIFICATION 3/10] verify.\n<!-- OMO_INTERNAL_INITIATOR -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags an ulw-prefixed directive (case-insensitive, short alias)", () => {
      const msg = textMessage(
        "ulw [SYSTEM DIRECTIVE: OH-MY-OPENCODE - ULTRAWORK LOOP VERIFICATION FAILED 1/5]",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a directive with leading whitespace", () => {
      const msg = textMessage("   [SYSTEM DIRECTIVE: OH-MY-OPENCODE - DELEGATION REQUIRED]");
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a bare OMO_INTERNAL_INITIATOR comment (e.g. model-fallback 'continue')", () => {
      const msg = textMessage("continue\n<!-- OMO_INTERNAL_INITIATOR -->");
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags an OMO_INTERNAL_NOREPLY comment (agent recovery)", () => {
      const msg = textMessage(
        "[restore checkpointed session agent configuration after compaction]\n<!-- OMO_INTERNAL_INITIATOR -->\n<!-- OMO_INTERNAL_NOREPLY -->",
      );
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags via metadata.compaction_continue when text has no marker", () => {
      const msg = textMessage("some text without any prefix or comment", {
        metadata: { compaction_continue: true },
      });
      expect(isHarnessMessage(msg)).toBe(true);
    });

    it("flags a split-across-parts directive text", () => {
      const msg: HarnessMessageLike = {
        parts: [
          { type: "text", text: "[SYSTEM DIRECTIVE: OH-MY-OPENCODE" },
          { type: "text", text: " - TODO CONTINUATION]" },
        ],
      };
      expect(isHarnessMessage(msg)).toBe(true);
    });
  });

  describe("passes through genuine user prompts", () => {
    it("keeps a plain prompt", () => {
      expect(isHarnessMessage(textMessage("Fix the login bug in auth.ts"))).toBe(false);
    });

    it("keeps a prompt mentioning 'system' or 'directive' generically", () => {
      expect(isHarnessMessage(textMessage("Can you explain the directive system call?"))).toBe(false);
    });

    it("keeps an empty-but-non-harness message", () => {
      const msg: HarnessMessageLike = { parts: [{ type: "text", text: "" }] };
      expect(isHarnessMessage(msg)).toBe(false);
    });

    it("keeps a message with only non-text parts", () => {
      const msg: HarnessMessageLike = { parts: [{ type: "file", text: "x" }] };
      expect(isHarnessMessage(msg)).toBe(false);
    });

    it("keeps a prompt that happens to contain an unrelated HTML comment", () => {
      expect(isHarnessMessage(textMessage("Review this: <!-- todo --> and the config"))).toBe(false);
    });

    it("does not match a near-miss prefix (different harness brand)", () => {
      expect(
        isHarnessMessage(textMessage("[SYSTEM DIRECTIVE: SOME-OTHER-TOOL - FOO]")),
      ).toBe(false);
    });
  });

  describe("marker robustness", () => {
    it("tolerates varying whitespace in the OMO comment", () => {
      expect(isHarnessMessage(textMessage("x\n<!--OMO_INTERNAL_INITIATOR-->"))).toBe(true);
      expect(isHarnessMessage(textMessage("x\n<!--  OMO_INTERNAL_INITIATOR  -->"))).toBe(true);
    });

    it("only treats boolean true on compaction_continue as a marker", () => {
      expect(
        isHarnessMessage(textMessage("plain", { metadata: { compaction_continue: "true" } })),
      ).toBe(false);
      expect(
        isHarnessMessage(textMessage("plain", { metadata: { compaction_continue: 1 } })),
      ).toBe(false);
    });
  });
});
