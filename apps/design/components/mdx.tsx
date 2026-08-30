import { Card, Cards } from 'fumadocs-ui/components/card';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { BrandShowcase } from '@/components/brand';
import { FoundationGrid } from '@/components/foundation-grid';
import { IconGallery } from '@/components/icon-gallery';
import { AppBarShowcase, AppBarMobileShowcase } from '@/components/showcase/appbar';
import { AvatarShowcase } from '@/components/showcase/avatar';
import { BadgeShowcase } from '@/components/showcase/badge';
import { BottomSheetShowcase } from '@/components/showcase/bottom-sheet';
import { BreadcrumbShowcase, BreadcrumbMobileShowcase } from '@/components/showcase/breadcrumb';
import { ButtonShowcase } from '@/components/showcase/button';
import { CardShowcase } from '@/components/showcase/card';
import { CodeInputShowcase } from '@/components/showcase/code-input';
import { ComboboxShowcase, ComboboxMobileShowcase } from '@/components/showcase/combobox';
import { CommandMenuShowcase } from '@/components/showcase/command-menu';
import { DialogShowcase } from '@/components/showcase/dialog';
import { DialogButtonsShowcase } from '@/components/showcase/dialog-buttons';
import { NavDrawerShowcase } from '@/components/showcase/drawer';
import { EditorToolbarShowcase } from '@/components/showcase/editor-toolbar';
import { EmptyStateShowcase } from '@/components/showcase/empty-state';
import { InputShowcase } from '@/components/showcase/input';
import { ListShowcase, ListEmptyShowcase, ListIconLeadingShowcase } from '@/components/showcase/list';
import { MenuShowcase, MenuSheetShowcase } from '@/components/showcase/menu';
import { SegmentedShowcase } from '@/components/showcase/segmented';
import { SelectShowcase, SelectSheetShowcase } from '@/components/showcase/select';
import { SidebarShowcase } from '@/components/showcase/sidebar';
import { SkeletonShowcase } from '@/components/showcase/skeleton';
import { TabsShowcase } from '@/components/showcase/tabs';
import { ToastShowcase } from '@/components/showcase/toast';
import { CheckboxShowcase, SwitchShowcase } from '@/components/showcase/toggles';
import { TooltipShowcase } from '@/components/showcase/tooltip';
import { NeutralScale, SwatchRow } from '@/components/tokens/color-scale';
import { ScaleTable } from '@/components/tokens/scale-table';
import { ShadowGrid } from '@/components/tokens/shadow-grid';
import { TypeScale } from '@/components/tokens/type-scale';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Card,
    Cards,
    BrandShowcase,
    FoundationGrid,
    IconGallery,
    NeutralScale,
    SwatchRow,
    ScaleTable,
    TypeScale,
    ShadowGrid,
    AppBarShowcase,
    AppBarMobileShowcase,
    AvatarShowcase,
    BadgeShowcase,
    BottomSheetShowcase,
    BreadcrumbShowcase,
    BreadcrumbMobileShowcase,
    ButtonShowcase,
    CardShowcase,
    CodeInputShowcase,
    DialogButtonsShowcase,
    ComboboxShowcase,
    ComboboxMobileShowcase,
    CommandMenuShowcase,
    DialogShowcase,
    NavDrawerShowcase,
    EditorToolbarShowcase,
    EmptyStateShowcase,
    InputShowcase,
    ListShowcase,
    ListEmptyShowcase,
    ListIconLeadingShowcase,
    MenuShowcase,
    MenuSheetShowcase,
    SegmentedShowcase,
    SelectShowcase,
    SelectSheetShowcase,
    SidebarShowcase,
    SkeletonShowcase,
    TabsShowcase,
    TooltipShowcase,
    ToastShowcase,
    CheckboxShowcase,
    SwitchShowcase,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
