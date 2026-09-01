// FR-003: DrizzleTicketStore — Drizzle/SQLite implementation of TicketStore.

import { asc, eq } from "drizzle-orm";
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
  StageRunRow,
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

  createTicket(data: NewTicket): Promise<TicketRow> {
    const [row] = this.db
      .insert(schema.tickets)
      .values({
        slug: data.slug,
        title: data.title,
        body: data.body ?? null,
        intent: data.intent,
        sourceRef: data.sourceRef,
      })
      .returning()
      .all();
    return Promise.resolve(row);
  }

  getTicket(id: number): Promise<TicketRow | undefined> {
    return Promise.resolve(
      this.db.select().from(schema.tickets).where(eq(schema.tickets.id, id)).get()
    );
  }

  async getFullTicket(id: number): Promise<FullTicket | undefined> {
    const ticket = await this.getTicket(id);
    if (!ticket) return undefined;

    const [reqs, acs, ws, sfs, provs] = [
      this.db.select().from(schema.requirements).where(eq(schema.requirements.ticketId, id)).all(),
      this.db
        .select()
        .from(schema.acceptanceCriteria)
        .where(eq(schema.acceptanceCriteria.ticketId, id))
        .all(),
      this.db.select().from(schema.weaknesses).where(eq(schema.weaknesses.ticketId, id)).all(),
      this.db
        .select()
        .from(schema.securityFindings)
        .where(eq(schema.securityFindings.ticketId, id))
        .all(),
      this.db.select().from(schema.provenance).where(eq(schema.provenance.ticketId, id)).all(),
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

  updateState(id: number, state: TicketRow["state"]): Promise<void> {
    this.db.update(schema.tickets).set({ state }).where(eq(schema.tickets.id, id)).run();
    return Promise.resolve();
  }

  addRequirement(input: NewRequirement): Promise<RequirementRow> {
    const [row] = this.db.insert(schema.requirements).values(input).returning().all();
    return Promise.resolve(row);
  }

  addAcceptanceCriterion(input: NewAcceptanceCriterion): Promise<AcceptanceCriterionRow> {
    const [row] = this.db.insert(schema.acceptanceCriteria).values(input).returning().all();
    return Promise.resolve(row);
  }

  addWeakness(input: NewWeakness): Promise<WeaknessRow> {
    const [row] = this.db.insert(schema.weaknesses).values(input).returning().all();
    return Promise.resolve(row);
  }

  addSecurityFinding(input: NewSecurityFinding): Promise<SecurityFindingRow> {
    const [row] = this.db.insert(schema.securityFindings).values(input).returning().all();
    return Promise.resolve(row);
  }

  addProvenance(input: NewProvenance): Promise<ProvenanceRow> {
    const [row] = this.db
      .insert(schema.provenance)
      .values({ ...input, at: new Date().toISOString() })
      .returning()
      .all();
    return Promise.resolve(row);
  }

  listRequirements(ticketId: number): Promise<RequirementRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.requirements)
        .where(eq(schema.requirements.ticketId, ticketId))
        .all()
    );
  }

  listAcceptanceCriteria(ticketId: number): Promise<AcceptanceCriterionRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.acceptanceCriteria)
        .where(eq(schema.acceptanceCriteria.ticketId, ticketId))
        .all()
    );
  }

  listWeaknesses(ticketId: number): Promise<WeaknessRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.weaknesses)
        .where(eq(schema.weaknesses.ticketId, ticketId))
        .all()
    );
  }

  listSecurityFindings(ticketId: number): Promise<SecurityFindingRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.securityFindings)
        .where(eq(schema.securityFindings.ticketId, ticketId))
        .all()
    );
  }

  listProvenance(ticketId: number): Promise<ProvenanceRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.provenance)
        .where(eq(schema.provenance.ticketId, ticketId))
        .all()
    );
  }

  startStageRun(ticketId: number, stageName: string): Promise<StageRunRow> {
    const [row] = this.db
      .insert(schema.stageRuns)
      .values({ ticketId, stageName, startedAt: new Date().toISOString() })
      .returning()
      .all();
    return Promise.resolve(row);
  }

  completeStageRun(
    runId: number,
    status: "passed" | "blocked" | "failed",
    reason?: string,
  ): Promise<void> {
    this.db
      .update(schema.stageRuns)
      .set({ status, reason: reason ?? null, endedAt: new Date().toISOString() })
      .where(eq(schema.stageRuns.id, runId))
      .run();
    return Promise.resolve();
  }

  listStageRuns(ticketId: number): Promise<StageRunRow[]> {
    return Promise.resolve(
      this.db
        .select()
        .from(schema.stageRuns)
        .where(eq(schema.stageRuns.ticketId, ticketId))
        .orderBy(asc(schema.stageRuns.id))
        .all(),
    );
  }
}
