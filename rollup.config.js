import commonjs from "@rollup/plugin-commonjs";

export default args => {
    const result = args.configDefaultConfig;
    
    return result.map((config, _index) => {
        console.log("Building format:", config.output.format);
        
        // For ES format, ensure proper ES module handling
        if (config.output.format === "es") {
            return {
                ...config,
                plugins: config.plugins.map(plugin => {
                    if (plugin && plugin.name === "commonjs") {
                        // replace common js plugin that transforms
                        // external requires to imports
                        // this is needed in order to work with modern client
                        return commonjs({
                            extensions: [".js", ".jsx", ".tsx", ".ts"],
                            transformMixedEsModules: true,
                            requireReturnsDefault: "auto",
                            esmExternals: true
                        });
                    }
                    return plugin;
                })
            };
        }
        
        // For AMD format, we might want to convert it to ES modules
        if (config.output.format === "amd") {
            return {
                ...config,
                output: {
                    ...config.output,
                    // Change AMD to ES format for the .js file
                    format: "es",
                    entryFileNames: '[name].js',
                    chunkFileNames: '[name]-[hash].js'
                },
                plugins: config.plugins.map(plugin => {
                    if (plugin && plugin.name === "commonjs") {
                        return commonjs({
                            extensions: [".js", ".jsx", ".tsx", ".ts"],
                            transformMixedEsModules: true,
                            requireReturnsDefault: "auto",
                            esmExternals: true
                        });
                    }
                    return plugin;
                })
            };
        }
        
        // Keep other formats as is
        return config;
    });
};