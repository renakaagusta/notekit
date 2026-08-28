import { Card, Cards } from 'fumadocs-ui/components/card';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { BrandShowcase } from '@/components/brand';
import { IconGallery } from '@/components/icon-gallery';
import { PrimitivesPreview } from '@/components/primitives-preview';
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
    NeutralScale,
    SwatchRow,
    PrimitivesPreview,
    ScaleTable,
    TypeScale,
    ShadowGrid,
    IconGallery,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
