export interface DialogueTurn {
  prompt: string;
  reply: string;
}

export interface DialogueActiveState {
  chatId: number;
  sessionId: string;
  transcriptMessageId: number;
  header: string;
  turns: DialogueTurn[];
}

export const DIALOGUE_CHUNK_CHAR_LIMIT = 3800;

const PROMPT_MARKER = "❯";

function renderTurns(turns: DialogueTurn[]): string {
  return turns
    .map((turn) => {
      const promptLine = `${PROMPT_MARKER} ${turn.prompt}`;
      return turn.reply.length > 0 ? `${promptLine}\n${turn.reply}` : promptLine;
    })
    .join("\n\n");
}

function renderWith(header: string, turns: DialogueTurn[]): string {
  return turns.length > 0 ? `${header}\n\n${renderTurns(turns)}` : header;
}

export function formatDialogueTranscriptText(header: string, turns: DialogueTurn[]): string {
  return renderWith(header, turns);
}

class DialogueManager {
  private state: DialogueActiveState | null = null;

  isActive(): boolean {
    return this.state !== null;
  }

  getState(): DialogueActiveState | null {
    return this.state;
  }

  start(chatId: number, sessionId: string, transcriptMessageId: number, header: string): void {
    this.state = {
      chatId,
      sessionId,
      transcriptMessageId,
      header,
      turns: [],
    };
  }

  end(): void {
    this.state = null;
  }

  matchesSession(sessionId: string): boolean {
    return this.state?.sessionId === sessionId;
  }

  getTranscriptMessageId(): number | null {
    return this.state?.transcriptMessageId ?? null;
  }

  render(): string {
    if (!this.state) {
      return "";
    }
    return renderWith(this.state.header, this.state.turns);
  }

  wouldOverflowWithPrompt(prompt: string): boolean {
    if (!this.state || this.state.turns.length === 0) {
      return false;
    }
    const projected = renderWith(this.state.header, [
      ...this.state.turns,
      { prompt, reply: "" },
    ]);
    return projected.length > DIALOGUE_CHUNK_CHAR_LIMIT;
  }

  rollover(newTranscriptMessageId: number, header: string): void {
    if (!this.state) {
      return;
    }
    this.state.transcriptMessageId = newTranscriptMessageId;
    this.state.header = header;
    this.state.turns = [];
  }

  addPrompt(prompt: string): void {
    if (!this.state) {
      return;
    }
    this.state.turns.push({ prompt, reply: "" });
  }

  updateLastReply(replyText: string): void {
    if (!this.state) {
      return;
    }
    const lastTurn = this.state.turns[this.state.turns.length - 1];
    if (lastTurn) {
      lastTurn.reply = replyText;
    }
  }

  hasPendingReply(): boolean {
    if (!this.state) {
      return false;
    }
    const lastTurn = this.state.turns[this.state.turns.length - 1];
    return Boolean(lastTurn && lastTurn.reply.length > 0);
  }
}

export const dialogueManager = new DialogueManager();
