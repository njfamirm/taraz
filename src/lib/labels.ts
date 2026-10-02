import type { Account, Project, Tag, Transaction } from "../db/types.ts";

export interface Chip {
  key: string;
  kind: string;
  title: string;
  color: string;
}

export type Labeler = (tx: Transaction) => Chip[];

/** Titled chips (account, project, tags) so a row says what each value is. */
export function makeLabeler(refs: {
  projects: Project[];
  tags: Tag[];
  accounts: Account[];
}): Labeler {
  const projects = new Map(refs.projects.map((p) => [p.id, p]));
  const tags = new Map(refs.tags.map((t) => [t.id, t]));
  const accounts = new Map(refs.accounts.map((a) => [a.id, a]));
  return (tx) => {
    const chips: Chip[] = [];
    const account = tx.accountId ? accounts.get(tx.accountId) : undefined;
    if (account) {
      chips.push({ key: "a", kind: "حساب", title: account.title, color: account.color });
    }
    const project = tx.projectId ? projects.get(tx.projectId) : undefined;
    if (project) {
      chips.push({ key: "p", kind: "پروژه", title: project.title, color: project.color });
    }
    for (const id of tx.tagIds) {
      const tag = tags.get(id);
      if (tag) chips.push({ key: `t${id}`, kind: "برچسب", title: tag.title, color: tag.color });
    }
    return chips;
  };
}
