import { Card, Cards } from 'fumadocs-ui/components/card';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { BrandShowcase } from '@/components/brand';
import { FoundationGrid } from '@/components/foundation-grid';
import { IconGallery } from '@/components/icon-gallery';
import { BadgeShowcase } from '@/components/showcase/badge';
import { BottomSheetShowcase } from '@/components/showcase/bottom-sheet';
import { ButtonShowcase } from '@/components/showcase/button';
import { DialogShowcase } from '@/components/showcase/dialog';
import { InputShowcase } from '@/components/showcase/input';
import { SelectShowcase, SelectSheetShowcase } from '@/components/showcase/select';
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
    NeutralScale,
    SwatchRow,
    ButtonShowcase,
    InputShowcase,
    BadgeShowcase,
    CheckboxShowcase,
    SwitchShowcase,
    DialogShowcase,
    BottomSheetShowcase,
    SelectShowcase,
    SelectSheetShowcase,
    TabsShowcase,
    TooltipShowcase,
    ToastShowcase,
    ScaleTable,
    TypeScale,
    ShadowGrid,
    IconGallery,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
