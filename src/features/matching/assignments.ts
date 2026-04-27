import type { DocumentBlock, DocumentBlockRole } from "../document/types";

export interface RoleAssignment {
  id: string;
  role: DocumentBlockRole;
}

export function applyRoleAssignments(blocks: DocumentBlock[], assignments: RoleAssignment[]): DocumentBlock[] {
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment.role]));

  return blocks.map((block) => ({
    ...block,
    role: assignmentsById.get(block.id) ?? block.role
  }));
}
