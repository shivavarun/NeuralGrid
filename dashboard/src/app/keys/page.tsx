'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useState, useCallback } from 'react';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  status: 'active' | 'revoked';
}

// Mock API: generates a fake full key on creation
function generateMockKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ng_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default function KeysPage() {
  const { data: session, status } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: 'key-1',
      key_prefix: 'ng_abc1234',
      name: 'Development Key',
      created_at: '2024-01-15T10:30:00Z',
      last_used_at: '2024-06-01T14:22:00Z',
      status: 'active',
    },
    {
      id: 'key-2',
      key_prefix: 'ng_xyz9876',
      name: 'CI/CD Pipeline',
      created_at: '2024-03-02T08:00:00Z',
      last_used_at: null,
      status: 'revoked',
    },
  ]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdFullKey, setCreatedFullKey] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    if (!newKeyName.trim()) return;

    const fullKey = generateMockKey();
    const prefix = fullKey.substring(0, 10); // "ng_" + first 7 chars

    const newKey: ApiKey = {
      id: generateId(),
      key_prefix: prefix,
      name: newKeyName.trim(),
      created_at: new Date().toISOString(),
      last_used_at: null,
      status: 'active',
    };

    setKeys((prev) => [newKey, ...prev]);
    setCreatedFullKey(fullKey);
    setNewKeyName('');
    setShowCreateForm(false);
  }, [newKeyName]);

  const handleRevoke = useCallback((id: string) => {
    setKeys((prev) =>
      prev.map((key) => (key.id === id ? { ...key, status: 'revoked' as const } : key))
    );
    setRevokeConfirmId(null);
  }, []);

  if (status === 'loading') {
    return <main style={{ padding: '2rem' }}><p>Loading...</p></main>;
  }

  if (!session) {
    redirect('/login');
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>API Keys</h1>
        <button
          onClick={() => { setShowCreateForm(true); setCreatedFullKey(null); }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Create Key
        </button>
      </div>

      {/* Created key banner — shown once */}
      {createdFullKey && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fef9c3',
          border: '1px solid #fbbf24',
          borderRadius: '6px',
        }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
            Copy your API key now. It will not be shown again.
          </p>
          <code style={{
            display: 'block',
            padding: '0.5rem',
            backgroundColor: '#fffbeb',
            borderRadius: '4px',
            wordBreak: 'break-all',
            fontSize: '0.875rem',
          }}>
            {createdFullKey}
          </code>
          <button
            onClick={() => setCreatedFullKey(null)}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          backgroundColor: '#f9fafb',
        }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>New API Key</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Key name (e.g. Production)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
              aria-label="API key name"
            />
            <button
              onClick={handleCreate}
              disabled={!newKeyName.trim()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: newKeyName.trim() ? '#16a34a' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: newKeyName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Generate
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewKeyName(''); }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 0.5rem' }}>Prefix</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>Name</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>Created</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>Last Used</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
            <th style={{ padding: '0.75rem 0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace' }}>
                {key.key_prefix}...
              </td>
              <td style={{ padding: '0.75rem 0.5rem' }}>{key.name}</td>
              <td style={{ padding: '0.75rem 0.5rem' }}>
                {new Date(key.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '0.75rem 0.5rem' }}>
                {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '0.75rem 0.5rem' }}>
                <span style={{
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor: key.status === 'active' ? '#dcfce7' : '#fee2e2',
                  color: key.status === 'active' ? '#166534' : '#991b1b',
                }}>
                  {key.status}
                </span>
              </td>
              <td style={{ padding: '0.75rem 0.5rem' }}>
                {key.status === 'active' && (
                  revokeConfirmId === key.id ? (
                    <span style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Revoke?</span>
                      <button
                        onClick={() => handleRevoke(key.id)}
                        style={{
                          padding: '0.125rem 0.5rem',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRevokeConfirmId(null)}
                        style={{
                          padding: '0.125rem 0.5rem',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setRevokeConfirmId(key.id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'white',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      Revoke
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {keys.length === 0 && (
        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '2rem' }}>
          No API keys yet. Create one to get started.
        </p>
      )}
    </main>
  );
}
