/** Re-exported from `src/shared/express-preprocess.ts` so both Host and Client streaming share identical lowering passes. */
export {
  desugarExpressConcat,
  flattenChainedCalc,
  foldNestedCondToLookup,
  preprocessExpressProgram,
} from '../shared/express-preprocess.ts'
