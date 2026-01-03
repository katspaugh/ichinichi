import { useAppModalsController } from '../controllers/useAppModalsController';
import { AppModalsView } from './AppModals/AppModalsView';

export function AppModals() {
  const viewModel = useAppModalsController();
  return <AppModalsView {...viewModel} />;
}
