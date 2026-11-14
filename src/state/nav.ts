import { trainerDrillStore, trainerExcluded, trainerSelection } from './data';

/**
 * Open the trainer on a drill; with `caseIds`, select only those cases (replaces that drill's selection).
 * A dynamic-case drill (learning / weakest) opens with all its cases on.
 */
export function openTrainer(drillId: string, caseIds?: string[]) {
  if (caseIds) trainerSelection.set({ ...trainerSelection.get(), [drillId]: caseIds });
  const { [drillId]: _dropped, ...excluded } = trainerExcluded.get();
  trainerExcluded.set(excluded);
  trainerDrillStore.set(drillId);
  location.hash = '#trainer';
}
