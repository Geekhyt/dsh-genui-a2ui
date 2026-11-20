import type { ReactCatalogComponent } from '@a2ui/react'
import { Catalog, WeightSchema } from '@a2ui/web_core/v1_0'
import { BASIC_CATALOG_ID, DSH_CATALOG_ID } from '../../shared/catalog-schema.ts'
import { DSH_REACT_COMPONENTS } from './BasicWidgets.tsx'
import { DSH_FUNCTIONS, SAFE_BASIC_FUNCTIONS } from './functions.ts'

export const dshReactCatalog = new Catalog<ReactCatalogComponent>(
  DSH_CATALOG_ID,
  '1.0',
  DSH_REACT_COMPONENTS,
  DSH_FUNCTIONS,
  {
    title: 'DeepSeek Harness A2UI 1.0 React Catalog',
    defModels: [WeightSchema],
  },
)

export const dshBasicCompatCatalog = new Catalog<ReactCatalogComponent>(
  BASIC_CATALOG_ID,
  '1.0',
  DSH_REACT_COMPONENTS,
  SAFE_BASIC_FUNCTIONS,
  {
    title: 'A2UI 1.0 Basic Catalog (DSH Native React)',
    defModels: [WeightSchema],
  },
)

export const DSH_CLIENT_CATALOGS = [dshReactCatalog, dshBasicCompatCatalog] as const
