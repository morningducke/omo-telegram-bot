/**
 * Detects messages injected by the oh-my-openagent (OhMyOpenCode) harness.
 *
 * The harness dispatches continuation / system-directive messages as ordinary
 * `role: "user"` turns via the OpenCode SDK's `session.promptAsync()`. Without
 * filtering, these flood the `/messages` list and session previews, burying
 * genuine user prompts under TODO-continuation, ralph-loop, boulder-continuation,
 * compaction-recovery, and similar harness noise.
 *
 * Markers are data-driven and cited from oh-my-openagent source so they can be
 * maintained as the harness evolves. See:
 *   createInternalAgentTextPart()      -> OMO_INTERNAL_INITIATOR/NOREPLY comments
 *   createSystemDirective(type)        -> "[SYSTEM DIRECTIVE: OH-MY-OPENCODE - {TYPE}]"
 *   ralph-loop / ultrawork variants    -> optional "ultrawork "/"ulw " prefix
 *   continuation text parts            -> metadata.compaction_continue === true
 */

/** Minimal shape of an OpenCode message part, as the bot consumes it. */
export interface HarnessMessagePartLike {
  type: string;
  text?: string;
  /**
   * OpenCode parts carry richer metadata than the bot's local types declare.
   * Accessed loosely so this filter stays robust to SDK shape changes.
   */
  metadata?: { compaction_continue?: unknown } & Record<string, unknown>;
}

/** Minimal message shape consumed by the filter. */
export interface HarnessMessageLike {
  parts: HarnessMessagePartLike[];
}

// --- Tier 1: HTML comment markers -------------------------------------
// Injected by createInternalAgentTextPart() (oh-my-openagent dist/index.js
// ~line 6975). Present in EVERY promptAsync-dispatched continuation message.
// Cannot appear in genuine user input — a user would have to type the exact
// marker string, which the harness only ever emits programmatically.
const OMO_INTERNAL_INITIATOR_RE = /<!--\s*OMO_INTERNAL_INITIATOR\s*-->/;
const OMO_INTERNAL_NOREPLY_RE = /<!--\s*OMO_INTERNAL_NOREPLY\s*-->/;

// --- Tier 3: system-directive text prefix ----------------------------
// Produced by createSystemDirective(type). ralph-loop/ultrawork variants may
// prepend "ultrawork " or "ulw " (oh-my-openagent dist/index.js ~line 96747).
const SYSTEM_DIRECTIVE_PREFIX = "[SYSTEM DIRECTIVE: OH-MY-OPENCODE";
const LEADING_HARNESS_KEYWORD_RE = /^\s*(?:ultrawork|ulw)\s+/i;

function concatTextParts(message: HarnessMessageLike): string {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

function hasInternalCommentMarker(text: string): boolean {
  return OMO_INTERNAL_INITIATOR_RE.test(text) || OMO_INTERNAL_NOREPLY_RE.test(text);
}

function isSystemDirectiveText(text: string): boolean {
  const trimmed = text.trimStart();
  if (trimmed.startsWith(SYSTEM_DIRECTIVE_PREFIX)) {
    return true;
  }
  return trimmed.replace(LEADING_HARNESS_KEYWORD_RE, "").startsWith(SYSTEM_DIRECTIVE_PREFIX);
}

function hasCompactionContinueMetadata(message: HarnessMessageLike): boolean {
  return message.parts.some((part) => part.metadata?.compaction_continue === true);
}

/**
 * Returns `true` if the message was injected by the oh-my-openagent harness
 * (continuation directives, compaction recovery, ralph/ultrawork loops, agent
 * recovery, model-fallback "continue", etc.).
 *
 * Detection tiers, most reliable first:
 *  1. `<!-- OMO_INTERNAL_INITIATOR|NOREPLY -->` comment in any text part
 *  2. `[SYSTEM DIRECTIVE: OH-MY-OPENCODE` text prefix (with optional
 *     `ultrawork `/`ulw ` prefix)
 *  3. `metadata.compaction_continue === true` on any part
 *
 * A genuine user prompt matches none of these tiers.
 */
export function isHarnessMessage(message: HarnessMessageLike): boolean {
  const text = concatTextParts(message);
  if (text.length > 0) {
    if (hasInternalCommentMarker(text)) {
      return true;
    }
    if (isSystemDirectiveText(text)) {
      return true;
    }
  }
  return hasCompactionContinueMetadata(message);
}
