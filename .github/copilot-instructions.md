# Error Prevention Notes

- [2025-11-21]: Don't combine Google search tools with function declarations in the same GenerateContentConfig - they are mutually exclusive in the Google GenAI API.
- [2025-11-21]: Always check if API response objects (candidates, content.parts) exist before iterating to avoid NoneType errors.
- [2025-11-22]: When updating user profiles from natural language input, use structured dictionary parameters in tool definitions instead of string parsing to ensure reliable updates.
- [2025-11-22]: Google GenAI function declarations don't support "additional_properties" or "additionalProperties" in nested object schemas - omit it and the API will accept any object structure.
