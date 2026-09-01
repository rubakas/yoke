// EchoGateway — offline/test swap for ModelGateway (ADR-0004, Layer-0 safe).
// Returns a canned or echoed reply without touching any network or provider key.

import type { ModelGateway, ChatMessage, ChatOptions, ChatResponse } from "../module/seams.js";

export class EchoGateway implements ModelGateway {
  private readonly reply: string | undefined;

  /**
   * @param opts.reply — fixed reply text; defaults to echoing the last user message.
   */
  constructor(opts?: { reply?: string }) {
    this.reply = opts?.reply;
  }

  async chat(messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResponse> {
    if (this.reply !== undefined) {
      return { content: this.reply };
    }
    const last = messages.at(-1);
    return { content: last ? `echo: ${last.content}` : "" };
  }
}
