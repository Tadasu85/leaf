# VSC Toolchain Issues & Resolution Plan

## Summary

We've identified and documented issues with the `@vsc.eco/client` npm package that prevent it from working properly when installed as a dependency. This document outlines the problems found and our plan to resolve them.

## Issues Discovered

### 1. Package Import Resolution Failure

**Problem**: The `@vsc.eco/client` package fails to resolve relative imports when installed as a dependency.

**Error**: 
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/path/to/node_modules/@vsc.eco/client/dist/queries' 
imported from '/path/to/node_modules/@vsc.eco/client/dist/index.js'
```

**Root Cause**: The package uses relative imports like `import { submitTxQuery } from "./queries"` in its compiled JavaScript, but these fail to resolve when the package is installed as a dependency.

### 2. ES Module Configuration Issues

**Problem**: The package is configured as an ES module (`"type": "module"`) but has internal import resolution problems.

**Impact**: Prevents the package from being used in Node.js applications, even with proper ES module configuration.

### 3. Package Structure Analysis

**Files Present**:
- `dist/index.js` - Main entry point
- `dist/queries.js` - GraphQL queries
- `dist/types.js` - Type definitions
- `dist/utils.js` - Utility functions

**Import Chain**:
```
index.js → imports "./queries" → queries.js
index.js → imports "./types" → types.js  
index.js → imports "./utils" → utils.js
```

## Technical Details

### Package Configuration
```json
{
  "name": "@vsc.eco/client",
  "version": "0.0.7",
  "type": "module",
  "main": "dist/index.js"
}
```

### Problematic Import
```javascript
// In dist/index.js line 5
import { submitTxQuery } from "./queries";
```

### Expected vs Actual Resolution
- **Expected**: `./queries` should resolve to `dist/queries.js`
- **Actual**: Node.js fails to resolve the relative path when the package is a dependency

## Resolution Plan

### Phase 1: Clone and Fix (Current)
1. **Clone VSC client repository** from GitHub
2. **Identify the build/packaging issue** in the source
3. **Fix the import resolution** problem
4. **Test locally** to ensure it works
5. **Submit PR** to the main VSC client repository

### Phase 2: Alternative Approaches
If the PR approach doesn't work:
1. **Fork the repository** and maintain our own fixed version
2. **Create a minimal VSC client wrapper** using the working parts
3. **Use direct source imports** instead of npm package

## Files to Fix

### Primary Issues
- [ ] Fix relative import paths in TypeScript source
- [ ] Ensure proper build configuration
- [ ] Test package installation and usage
- [ ] Verify ES module compatibility

### Build Configuration
- [ ] Check `tsconfig.json` for proper module resolution
- [ ] Verify build scripts and output structure
- [ ] Test package publishing locally

## Testing Strategy

### Local Testing
1. **Clone repository** and install dependencies
2. **Build package** locally
3. **Test import resolution** in a test project
4. **Verify ES module compatibility**

### Integration Testing
1. **Test with Leaf's VSCAdapter**
2. **Verify contract call functionality**
3. **Test authentication methods**
4. **Validate transaction creation**

## Expected Outcome

After fixing the packaging issues, we should have:
- ✅ Working VSC client package
- ✅ Proper ES module support
- ✅ Functional contract interaction
- ✅ Integration with Leaf's verb runtime
- ✅ Contribution to VSC ecosystem

## Next Steps

1. **Clone VSC client repository**
2. **Investigate build configuration**
3. **Fix import resolution issues**
4. **Test locally**
5. **Submit PR to main repository**

## References

- [VSC Client Repository](https://github.com/vsc-eco/client)
- [VSC Node Repository](https://github.com/vsc-eco/go-vsc-node)
- [VSC Contract Verification Tool](https://vsc.techcoderx.com/tools/verify/contract)
- [VSC Main Site](https://vsc.eco)

---

**Status**: 🔍 Investigating packaging issues  
**Next Action**: Clone and fix VSC client source  
**Target**: Submit working PR to main repository
