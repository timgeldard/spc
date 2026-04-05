/**
 * CustomerList — Searchable table of customers who received this batch
 *
 * Data sourced from dataset deb1ffdc (Impact Analysis).
 *
 * @param {{ customers: Array|null, loading: boolean }} props
 */
import { useMemo, useState } from 'react'

export default function CustomerList({ customers, loading }) {
  const [searchTerm, setSearchTerm] = useState('')

  // Filter customers by search term
  const filtered = useMemo(() => {
    const safeCustomers = customers || []
    if (!searchTerm) return customers
    const term = searchTerm.toLowerCase()
    return safeCustomers.filter(
      (c) =>
        (c.customer_name?.toLowerCase().includes(term) ?? false) ||
        (c.country?.toLowerCase().includes(term) ?? false)
    )
  }, [customers, searchTerm])

  if (loading) {
    return (
      <div className="card customer-list-card">
        <h3 className="card-title">Customers Affected</h3>
        <p className="card-loading">Loading customers…</p>
      </div>
    )
  }

  if (!customers) {
    return (
      <div className="card customer-list-card">
        <h3 className="card-title">Customers Affected</h3>
        <p className="card-empty">Select a batch to view customers.</p>
      </div>
    )
  }

  return (
    <div className="card customer-list-card">
      <h3 className="card-title">Customers Affected</h3>
      {customers.length > 0 ? (
        <>
          <input
            type="text"
            placeholder="Search customer or country…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="customer-search"
          />
          <div className="customer-table-wrapper">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer, idx) => (
                  <tr key={idx}>
                    <td>{customer.customer_name || '—'}</td>
                    <td>{customer.country || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="card-empty filter-empty">No matches found.</p>
          )}
          {filtered.length > 0 && (
            <p className="customer-count">
              Showing <strong>{filtered.length}</strong> of <strong>{customers.length}</strong> customers
            </p>
          )}
        </>
      ) : (
        <p className="card-empty">No customers found for this batch.</p>
      )}
    </div>
  )
}
