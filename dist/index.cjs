'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var path = require('path');
var esbuild = require('esbuild');
var loaderUtils = require('loader-utils');
var getTsconfig = require('get-tsconfig');
var webpackSources = require('webpack-sources');
var ModuleFilenameHelpers_js = require('webpack/lib/ModuleFilenameHelpers.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var path__default = /*#__PURE__*/_interopDefaultLegacy(path);

let foundTsconfig;
let fileMatcher;
async function ESBuildLoader(source) {
  var _a, _b, _c;
  const done = this.async();
  const options = loaderUtils.getOptions(this);
  const {
    implementation,
    tsconfig,
    ...esbuildTransformOptions
  } = options;
  if (implementation && typeof implementation.transform !== "function") {
    done(
      new TypeError(
        `esbuild-loader: options.implementation.transform must be an ESBuild transform function. Received ${typeof implementation.transform}`
      )
    );
    return;
  }
  const transform = (_a = implementation == null ? void 0 : implementation.transform) != null ? _a : esbuild.transform;
  const transformOptions = {
    ...esbuildTransformOptions,
    target: (_b = options.target) != null ? _b : "es2015",
    loader: (_c = options.loader) != null ? _c : "default",
    sourcemap: this.sourceMap,
    sourcefile: this.resourcePath
  };
  if (!("tsconfigRaw" in transformOptions)) {
    if (!fileMatcher) {
      const tsconfigPath = tsconfig && path__default["default"].resolve(tsconfig);
      foundTsconfig = tsconfigPath ? {
        config: getTsconfig.parseTsconfig(tsconfigPath),
        path: tsconfigPath
      } : getTsconfig.getTsconfig();
      if (foundTsconfig) {
        fileMatcher = getTsconfig.createFilesMatcher(foundTsconfig);
      }
    }
    if (fileMatcher) {
      transformOptions.tsconfigRaw = fileMatcher(
        this.resourcePath
      );
    }
  }
  try {
    const { code, map } = await transform(source, transformOptions);
    done(null, code, map && JSON.parse(map));
  } catch (error) {
    done(error);
  }
}

var version = "0.0.0-semantic-release";

const isJsFile = /\.[cm]?js(?:\?.*)?$/i;
const isCssFile = /\.css(?:\?.*)?$/i;
const pluginName = "EsbuildPlugin";
const transformAssets = async (options, transform, compilation, useSourceMap) => {
  const { compiler } = compilation;
  const sources = "webpack" in compiler && compiler.webpack.sources;
  const SourceMapSource = sources ? sources.SourceMapSource : webpackSources.SourceMapSource;
  const RawSource = sources ? sources.RawSource : webpackSources.RawSource;
  const {
    css: minifyCss,
    include,
    exclude,
    ...transformOptions
  } = options;
  const assets = compilation.getAssets().filter((asset) => !asset.info.minimized && (isJsFile.test(asset.name) || minifyCss && isCssFile.test(asset.name)) && ModuleFilenameHelpers_js.matchObject(
    { include, exclude },
    asset.name
  ));
  await Promise.all(assets.map(async (asset) => {
    const assetIsCss = isCssFile.test(asset.name);
    let source;
    let map = null;
    if (asset.source.sourceAndMap) {
      const sourceAndMap = asset.source.sourceAndMap();
      source = sourceAndMap.source;
      map = sourceAndMap.map;
    } else {
      source = asset.source.source();
      if (asset.source.map) {
        map = asset.source.map();
      }
    }
    const sourceAsString = source.toString();
    const result = await transform(sourceAsString, {
      ...transformOptions,
      loader: assetIsCss ? "css" : transformOptions.loader,
      sourcemap: useSourceMap,
      sourcefile: asset.name
    });
    if (result.legalComments) {
      compilation.emitAsset(
        `${asset.name}.LEGAL.txt`,
        new RawSource(result.legalComments)
      );
    }
    compilation.updateAsset(
      asset.name,
      result.map ? new SourceMapSource(
        result.code,
        asset.name,
        result.map,
        sourceAsString,
        map,
        true
      ) : new RawSource(result.code),
      {
        ...asset.info,
        minimized: true
      }
    );
  }));
};
function EsbuildPlugin({
  implementation,
  ...options
} = {}) {
  var _a;
  if (implementation && typeof implementation.transform !== "function") {
    throw new TypeError(
      `[${pluginName}] implementation.transform must be an esbuild transform function. Received ${typeof implementation.transform}`
    );
  }
  const transform = (_a = implementation == null ? void 0 : implementation.transform) != null ? _a : esbuild.transform;
  const hasGranularMinificationConfig = "minifyIdentifiers" in options || "minifySyntax" in options || "minifyWhitespace" in options;
  if (!hasGranularMinificationConfig) {
    options.minify = true;
  }
  return {
    apply(compiler) {
      if (!("format" in options)) {
        const { target } = compiler.options;
        const isWebTarget = Array.isArray(target) ? target.includes("web") : target === "web";
        const wontGenerateHelpers = !options.target || (Array.isArray(options.target) ? options.target.length === 1 && options.target[0] === "esnext" : options.target === "esnext");
        if (isWebTarget && !wontGenerateHelpers) {
          options.format = "iife";
        }
      }
      compiler.hooks.compilation.tap(pluginName, (compilation) => {
        const meta = JSON.stringify({
          name: "esbuild-loader",
          version,
          options
        });
        compilation.hooks.chunkHash.tap(
          pluginName,
          (_, hash) => hash.update(meta)
        );
        let useSourceMap = false;
        compilation.hooks.finishModules.tap(
          pluginName,
          (modules) => {
            const firstModule = Array.isArray(modules) ? modules[0] : modules.values().next().value;
            useSourceMap = firstModule.useSourceMap;
          }
        );
        if ("processAssets" in compilation.hooks) {
          compilation.hooks.processAssets.tapPromise(
            {
              name: pluginName,
              stage: compilation.constructor.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
              additionalAssets: true
            },
            () => transformAssets(options, transform, compilation, useSourceMap)
          );
          compilation.hooks.statsPrinter.tap(pluginName, (statsPrinter) => {
            statsPrinter.hooks.print.for("asset.info.minimized").tap(
              pluginName,
              (minimized, { green, formatFlag }) => minimized ? green(formatFlag("minimized")) : void 0
            );
          });
        } else {
          compilation.hooks.optimizeChunkAssets.tapPromise(
            pluginName,
            () => transformAssets(options, transform, compilation, useSourceMap)
          );
        }
      });
    }
  };
}

exports.EsbuildPlugin = EsbuildPlugin;
exports["default"] = ESBuildLoader;
