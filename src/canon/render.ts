export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!(name in vars)) {
      throw new Error(`renderPrompt: no value provided for placeholder "{{${name}}}"`);
    }
    return vars[name];
  });
}
