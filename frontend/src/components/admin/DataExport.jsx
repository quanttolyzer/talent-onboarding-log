import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function DataExport() {
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [selectedData, setSelectedData] = useState('tickets');
  const [isExporting, setIsExporting] = useState(false);

  const exportOptions = [
    { id: 'tickets', label: 'Tickets Data', description: 'All ticket records with full details' },
    { id: 'users', label: 'Users Data', description: 'All user accounts and roles' },
  ];

  const formatOptions = [
    { id: 'csv', label: 'CSV', description: 'Comma-separated values, compatible with Excel' },
    { id: 'json', label: 'JSON', description: 'Structured data format' },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.get(`/admin/export/${selectedData}`, {
        params: { format: selectedFormat },
        responseType: selectedFormat === 'csv' ? 'blob' : 'json',
        timeout: 60000,
      });

      if (selectedFormat === 'csv') {
        // Create download link for CSV
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedData}-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        // Download JSON
        const dataStr = JSON.stringify(response.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedData}-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

      toast.success('Export completed successfully');
    } catch (error) {
      toast.error('Export failed. Please try again.');
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 700 }}>Data Export</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.9rem' }}>
          Export system data in various formats for analysis and reporting.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '800px' }}>
        {/* Data Selection */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>Select Data</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {exportOptions.map(option => (
              <label key={option.id} style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '12px',
                cursor: 'pointer',
                padding: '12px',
                borderRadius: '8px',
                border: selectedData === option.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedData === option.id ? 'var(--bg-tertiary)' : 'transparent',
                transition: 'var(--transition)',
              }}>
                <input
                  type="radio"
                  name="data"
                  value={option.id}
                  checked={selectedData === option.id}
                  onChange={(e) => setSelectedData(e.target.value)}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{option.label}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Format Selection */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>Select Format</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {formatOptions.map(format => (
              <label key={format.id} style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '12px',
                cursor: 'pointer',
                padding: '12px',
                borderRadius: '8px',
                border: selectedFormat === format.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selectedFormat === format.id ? 'var(--bg-tertiary)' : 'transparent',
                transition: 'var(--transition)',
              }}>
                <input
                  type="radio"
                  name="format"
                  value={format.id}
                  checked={selectedFormat === format.id}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{format.label}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{format.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Export Summary */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginTop: '24px',
        maxWidth: '800px',
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 600 }}>Export Summary</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              {exportOptions.find(o => o.id === selectedData)?.label}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
              Format: {formatOptions.find(f => f.id === selectedFormat)?.label.toUpperCase()}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isExporting}
            style={{ minWidth: '120px' }}
          >
            {isExporting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                Exporting...
              </>
            ) : (
              '📥 Export Now'
            )}
          </button>
        </div>
        
        <div style={{ 
          fontSize: '0.8rem', 
          color: 'var(--text-2)', 
          padding: '12px',
          background: 'var(--bg-tertiary)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
        }}>
          <strong>Note:</strong> Large datasets may take some time to process. The file will be downloaded automatically when ready.
        </div>
      </div>

      {/* Recent Exports Info */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginTop: '24px',
        maxWidth: '800px',
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 600 }}>Export Information</h3>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong>Tickets Export:</strong> Includes all ticket records with associated data like positions, departments, hiring managers, and user assignments.
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong>Users Export:</strong> Includes all user accounts with their roles, status, and creation dates.
          </p>
          <p style={{ margin: 0 }}>
            <strong>CSV Format:</strong> Best for importing into spreadsheet applications like Excel or Google Sheets.
          </p>
        </div>
      </div>
    </div>
  );
}
