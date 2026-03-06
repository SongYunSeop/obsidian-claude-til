# Research Skill Templates

## Backlog Template

```markdown
---
tags: [backlog, {category}]
aliases: ["Backlog - {topic}"]
updated: YYYY-MM-DD
sources:
  slug-a: [https://url-1]
---

# {topic} Learning Backlog

## Prerequisites
- [ ] [Concept A](til/{category}/{slug-a}.md) - description

## Core Concepts
- [ ] [Concept C](til/{category}/{slug-c}.md) - description

## Advanced
- [ ] [Concept E](til/{category}/{slug-e}.md) - description
```

### Field descriptions

- `tags`: Always include `backlog` and the category name
- `aliases`: Human-readable name for Obsidian search
- `updated`: Date of last modification (YYYY-MM-DD)
- `sources`: Map of slug → source URL array. Used by `/til` skill to fetch reference material when learning a backlog item
- Sections (Prerequisites / Core Concepts / Advanced): Order items by learning dependency — prerequisites first, advanced last
- Each item: `- [ ] [Display Name](til/{category}/{slug}.md) - one-line description`
