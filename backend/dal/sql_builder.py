from dataclasses import dataclass, field


def _indent_block(sql: str, spaces: int = 4) -> str:
    indent = " " * spaces
    return "\n".join(f"{indent}{line}" if line else "" for line in sql.strip().splitlines())


@dataclass
class SqlSelectBuilder:
    select_columns: list[str] = field(default_factory=list)
    from_clause: str | None = None
    joins: list[str] = field(default_factory=list)
    where_conditions: list[str] = field(default_factory=list)
    group_by_clauses: list[str] = field(default_factory=list)
    order_by_clauses: list[str] = field(default_factory=list)
    limit_clause: str | None = None

    def select(self, *columns: str) -> "SqlSelectBuilder":
        self.select_columns.extend(column for column in columns if column)
        return self

    def from_(self, clause: str) -> "SqlSelectBuilder":
        self.from_clause = clause
        return self

    def join(self, clause: str) -> "SqlSelectBuilder":
        if clause:
            self.joins.append(clause)
        return self

    def where(self, condition: str | None) -> "SqlSelectBuilder":
        if condition:
            self.where_conditions.append(condition)
        return self

    def group_by(self, *clauses: str) -> "SqlSelectBuilder":
        self.group_by_clauses.extend(clause for clause in clauses if clause)
        return self

    def order_by(self, *clauses: str) -> "SqlSelectBuilder":
        self.order_by_clauses.extend(clause for clause in clauses if clause)
        return self

    def limit(self, clause: str | int) -> "SqlSelectBuilder":
        self.limit_clause = str(clause)
        return self

    def build(self) -> str:
        if not self.select_columns or not self.from_clause:
            raise ValueError("SELECT queries require at least one column and a FROM clause")

        parts = [
            "SELECT",
            _indent_block(",\n".join(self.select_columns)),
            f"FROM {self.from_clause}",
        ]
        parts.extend(self.joins)
        if self.where_conditions:
            parts.append("WHERE " + "\n  AND ".join(self.where_conditions))
        if self.group_by_clauses:
            parts.append("GROUP BY " + ", ".join(self.group_by_clauses))
        if self.order_by_clauses:
            parts.append("ORDER BY " + ", ".join(self.order_by_clauses))
        if self.limit_clause is not None:
            parts.append(f"LIMIT {self.limit_clause}")
        return "\n".join(parts)


@dataclass
class SqlWithQueryBuilder:
    ctes: list[tuple[str, str]] = field(default_factory=list)
    final_query: SqlSelectBuilder | None = None

    def with_cte(self, name: str, query: SqlSelectBuilder) -> "SqlWithQueryBuilder":
        self.ctes.append((name, query.build()))
        return self

    def select(self, query: SqlSelectBuilder) -> "SqlWithQueryBuilder":
        self.final_query = query
        return self

    def build(self) -> str:
        if self.final_query is None:
            raise ValueError("WITH queries require a final SELECT query")
        if not self.ctes:
            return self.final_query.build()

        rendered_ctes = ",\n".join(
            f"{name} AS (\n{_indent_block(query)}\n)" for name, query in self.ctes
        )
        return f"WITH {rendered_ctes}\n{self.final_query.build()}"
