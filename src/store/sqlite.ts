// FR-003: DrizzleTicketStore — Drizzle/SQLite implementation of TicketStore.

import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { DbInstance } from "../db/index.js";
import type {
  TicketStore,
  TicketRow,
  RequirementRow,
  AcceptanceCriterionRow,
  WeaknessRow,
  SecurityFindingRow,
  ProvenanceRow,
  NewTicket,
  NewRequirement,
  NewAcceptanceCriterion,
  NewWeakness,
  NewSecurityFinding,
  NewProvenance,
  FullTicket,
} from "../module/seams.js";

export class DrizzleTicketStore implements TicketStore {
  constructor(private readonly db: DbInstance) {}

  async createTicket(data: NewTicket): Promise<TicketRow> {
    const [row] = this.db
      .insert(schema.tickets)
      .values({
        slug: data.slug,
        title: data.title,
        intent: data.intent,
        sourceRef: data.sourceRef,
      })
      .returning()
      .all();
    return row;
  }

  async getTicket(id: number): Promise<TicketRow | undefined> {
    return this.db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.id, id))
      .get();
  }

  async getFullTicket(id: number): Promise<FullTicket | undefined> {
    const ticket = await this.getTicket(id);
    if (!ticket) return undefined;

    const [reqs, acs, ws, sfs, provs] = [
      this.db
        .select()
        .from(schema.requirements)
        .where(eq(schema.requirements.ticketId, id))
        .all(),
      this.db
        .select()
        .from(schema.acceptanceCriteria)
        .where(eq(schema.acceptanceCriteria.ticketId, id))
        .all(),
      this.db
        .select()
        .from(schema.weaknesses)
        .where(eq(schema.weaknesses.ticketId, id))
        .all(),
      this.db
        .select()
        .from(schema.securityFindings)
        .where(eq(schema.securityFindings.ticketId, id))
        .all(),
      this.db
        .select()
        .from(schema.provenance)
        .where(eq(schema.provenance.ticketId, id))
        .all(),
    ];

    return {
      ...ticket,
      requirements: reqs,
      acceptanceCriteria: acs,
      weaknesses: ws,
      securityFindings: sfs,
      provenance: provs,
    };
  }

  async updateState(id: number, state: TicketRow["state"]): Promise<void> {
    this.db
      .update(schema.tickets)
      .set({ state })
      .where(eq(schema.tickets.id, id))
      .run();
  }

  async addRequirement(input: NewRequirement): Promise<RequirementRow> {
    const [row] = this.db
      .insert(schema.requirements)
      .values(input)
      .returning()
      .all();
    return row;
  }

  async addAcceptanceCriterion(input: NewAcceptanceCriterion): Promise<AcceptanceCriterionRow> {
    const [row] = this.db
      .insert(schema.acceptanceCriteria)
      .values(input)
      .returning()
      .all();
    return row;
  }

  async addWeakness(input: NewWeakness): Promise<WeaknessRow> {
    const [row] = this.db
      .insert(schema.weaknesses)
      .values(input)
      .returning()
      .all();
    return row;
  }

  async addSecurityFinding(input: NewSecurityFinding): Promise<SecurityFindingRow> {
    const [row] = this.db
      .insert(schema.securityFindings)
      .values(input)
      .returning()
      .all();
    return row;
  }

  async addProvenance(input: NewProvenance): Promise<ProvenanceRow> {
    const [row] = this.db
      .insert(schema.provenance)
      .values({ ...input, at: new Date().toISOString() })
      .returning()
      .all();
    return row;
  }

  async listRequirements(ticketId: number): Promise<RequirementRow[]> {
    return this.db
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.ticketId, ticketId))
      .all();
  }

  async listAcceptanceCriteria(ticketId: number): Promise<AcceptanceCriterionRow[]> {
    return this.db
      .select()
      .from(schema.acceptanceCriteria)
      .where(eq(schema.acceptanceCriteria.ticketId, ticketId))
      .all();
  }

  async listWeaknesses(ticketId: number): Promise<WeaknessRow[]> {
    return this.db
      .select()
      .from(schema.weaknesses)
      .where(eq(schema.weaknesses.ticketId, ticketId))
      .all();
  }

  async listSecurityFindings(ticketId: number): Promise<SecurityFindingRow[]> {
    return this.db
      .select()
      .from(schema.securityFindings)
      .where(eq(schema.securityFindings.ticketId, ticketId))
      .all();
  }

  async listProvenance(ticketId: number): Promise<ProvenanceRow[]> {
    return this.db
      .select()
      .from(schema.provenance)
      .where(eq(schema.provenance.ticketId, ticketId))
      .all();
  }
}
