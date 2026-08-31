import AssignmentControlCenter from './AssignmentControlCenter';
import type { AssignmentRun } from '../../types/assignment';

interface Props {
  runs: AssignmentRun[];
}

export default function AssignmentVisualizer({ runs }: Props) {
  return <AssignmentControlCenter runs={runs} />;
}
