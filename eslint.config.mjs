import tseslint from "typescript-eslint";

export default tseslint.config(
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		ignores: ["dist/", "node_modules/", "src/__tests__/"],
	},
);
