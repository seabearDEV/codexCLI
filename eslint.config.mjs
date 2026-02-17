import tseslint from "typescript-eslint";

export default tseslint.config(
	...tseslint.configs.recommended,
	{
		files: ["src/**/*.ts"],
	},
	{
		ignores: ["dist/", "node_modules/", "src/__tests__/"],
	},
);
