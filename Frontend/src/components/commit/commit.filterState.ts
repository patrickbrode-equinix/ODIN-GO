/* ------------------------------------------------ */
/* COMMIT – FILTER STATE                            */
/* ------------------------------------------------ */

export interface CommitFilters {
  compliance: boolean;
  missed: boolean;
  migration: boolean;
  deinstall: boolean;
  scheduled: boolean;
  ibx: string[]; // multi select
}

export const defaultCommitFilters: CommitFilters = {
  compliance: false,
  missed: false,
  migration: false,
  deinstall: false,
  scheduled: false,
  ibx: [],
};
