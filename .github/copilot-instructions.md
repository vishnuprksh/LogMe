# Error Prevention Notes

- [2025-11-21]: Don't combine Google search tools with function declarations in the same GenerateContentConfig - they are mutually exclusive in the Google GenAI API.
- [2025-11-21]: Always check if API response objects (candidates, content.parts) exist before iterating to avoid NoneType errors.
