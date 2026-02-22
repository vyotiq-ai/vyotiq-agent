// Layout Components barrel export
export { ErrorBoundary, FeatureErrorBoundary } from './ErrorBoundary';
export { Header } from './Header';
export { MainLayout } from './MainLayout';
export { Sidebar } from './Sidebar';
export { SplitPane } from './SplitPane';
export type { SplitDirection } from './SplitPane';

// Header sub-components
export {
  HeaderIconButton,
  HeaderDivider,
  HeaderNavSection,
  HeaderActionsSection,
  WINDOW_CONTROLS_WIDTH,
  HEADER_HEIGHT,
} from './header/index';
export type { HeaderIconButtonProps } from './header/index';

// Sidebar sub-components
export { SectionHeader } from './sidebar/SectionHeader';
export { SidebarItem } from './sidebar/SidebarItem';
