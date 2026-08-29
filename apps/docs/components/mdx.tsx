import { Card, Cards } from 'fumadocs-ui/components/card';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { HexagonDiagram } from '@/components/diagrams/hexagon';
import { KeyHierarchyDiagram } from '@/components/diagrams/key-hierarchy';
import { SystemArchitectureDiagram } from '@/components/diagrams/system-architecture';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Card,
    Cards,
    Mermaid,
    SystemArchitectureDiagram,
    KeyHierarchyDiagram,
    HexagonDiagram,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
