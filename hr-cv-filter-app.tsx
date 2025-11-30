import React, { useState, useEffect } from 'react';
import { Upload, FileText, Filter, Search, Download, Trash2, CheckCircle, Star, Menu, Folder, Plus, Send, XCircle, Settings } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

export default function HRCVFilter() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [jobDescription, setJobDescription] = useState('');
  const [threshold, setThreshold] = useState(0.3);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const folders = [
    { id: 'all', name: 'All Documents', icon: FileText, count: uploadedFiles.length },
    { id: 'matched', name: 'Matched', icon: CheckCircle, count: uploadedFiles.filter(f => f.status === 'matched').length },
    { id: 'rejected', name: 'Rejected', icon: XCircle, count: uploadedFiles.filter(f => f.status === 'rejected').length },
    { id: 'pending', name: 'Pending', icon: Folder, count: uploadedFiles.filter(f => f.status === 'pending').length },
  ];

  // Load candidates from backend
  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const response = await fetch(`${API_URL}/candidates`);
      const data = await response.json();
      setUploadedFiles(data.candidates || []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files) => {
    setLoading(true);
    const formData = new FormData();
    
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    if (jobDescription) {
      formData.append('jobDescription', jobDescription);
    }

    try {
      const response = await fetch(`${API_URL}/upload-batch`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchCandidates();
        alert(`Successfully uploaded ${data.processed} resumes!`);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Failed to upload files. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = async (id) => {
    try {
      await fetch(`${API_URL}/delete-candidate/${id}`, {
        method: 'DELETE',
      });
      setUploadedFiles(uploadedFiles.filter(file => file.id !== id));
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const applyFilters = async () => {
    if (!jobDescription.trim()) {
      alert('Please enter a job description first!');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/filter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobDescription,
          minScore: threshold,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setUploadedFiles(data.candidates);
        alert('Filtering complete!');
      }
    } catch (error) {
      console.error('Error filtering:', error);
      alert('Failed to filter candidates. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const sendEmails = async (sendTo = 'all') => {
    if (window.confirm(`Send emails to ${sendTo} candidates?`)) {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/send-emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sendTo }),
        });

        const data = await response.json();
        
        if (data.success) {
          alert(`Successfully sent ${data.sent} emails!`);
        }
      } catch (error) {
        console.error('Error sending emails:', error);
        alert('Failed to send emails.');
      } finally {
        setLoading(false);
      }
    }
  };

  const exportCSV = async () => {
    try {
      const response = await fetch(`${API_URL}/export-csv`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'candidates_report.csv';
      a.click();
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV.');
    }
  };

  const filteredFiles = selectedFolder === 'all' 
    ? uploadedFiles 
    : uploadedFiles.filter(f => f.status === selectedFolder);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">CV Filter Pro</span>
          </div>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase">Categories</span>
            </div>
            <div className="space-y-1">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    selectedFolder === folder.id
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <folder.icon className="w-4 h-4" />
                    <span className="text-sm">{folder.name}</span>
                  </div>
                  <span className="text-xs bg-gray-800 px-2 py-1 rounded">{folder.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-2 mt-6">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800">
          <label htmlFor="sidebar-upload" className="block">
            <div className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>Upload Resumes</span>
            </div>
          </label>
          <input
            type="file"
            id="sidebar-upload"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">AI Resume Filter</h1>
              <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">Beta v1.0</span>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => sendEmails('matched')}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Send to Matched</span>
              </button>
              <button
                onClick={exportCSV}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-8">
            {/* Job Description Input */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h3>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here to filter candidates..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-4">
                  <label className="text-sm text-gray-600">
                    Threshold: {threshold}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="w-32"
                  />
                </div>
                <button
                  onClick={applyFilters}
                  disabled={loading || !jobDescription}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center space-x-2"
                >
                  <Filter className="w-4 h-4" />
                  <span>{loading ? 'Processing...' : 'Apply Filter'}</span>
                </button>
              </div>
            </div>

            {uploadedFiles.length === 0 ? (
              <div className="text-center py-12">
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-16 transition-all ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="file"
                    id="main-upload"
                    multiple
                    accept=".pdf,.doc,.docx"
                    onChange={handleChange}
                    className="hidden"
                  />
                  <label htmlFor="main-upload" className="cursor-pointer">
                    <div className="inline-block bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-3xl mb-6">
                      <Upload className="w-16 h-16 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      Upload Resumes to Get Started
                    </h2>
                    <p className="text-gray-600 mb-4">
                      Drag and drop files here or click to browse
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports PDF, DOC, DOCX • Max 10MB per file
                    </p>
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {folders.find(f => f.id === selectedFolder)?.name || 'Documents'}
                  </h2>
                  <span className="text-gray-500">{filteredFiles.length} candidates</span>
                </div>

                <div className="space-y-3">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`bg-white border-2 rounded-2xl p-6 transition-all ${
                        file.status === 'matched'
                          ? 'border-green-200 bg-green-50'
                          : file.status === 'rejected'
                          ? 'border-red-200 bg-red-50'
                          : 'border-gray-200 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            file.status === 'matched'
                              ? 'bg-green-200'
                              : file.status === 'rejected'
                              ? 'bg-red-200'
                              : 'bg-blue-100'
                          }`}>
                            {file.status === 'matched' ? (
                              <CheckCircle className="w-6 h-6 text-green-700" />
                            ) : file.status === 'rejected' ? (
                              <XCircle className="w-6 h-6 text-red-700" />
                            ) : (
                              <FileText className="w-6 h-6 text-blue-700" />
                            )}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{file.filename}</h4>
                            <div className="flex items-center space-x-4 mt-1">
                              <p className="text-sm text-gray-600">{file.email}</p>
                              {file.score > 0 && (
                                <span className="text-sm font-medium text-gray-700">
                                  Score: {(file.score * 100).toFixed(1)}%
                                </span>
                              )}
                              <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                                file.status === 'matched'
                                  ? 'bg-green-200 text-green-800'
                                  : file.status === 'rejected'
                                  ? 'bg-red-200 text-red-800'
                                  : 'bg-gray-200 text-gray-700'
                              }`}>
                                {file.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => removeFile(file.id)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border-t border-gray-200 px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            AI-powered resume filtering • {uploadedFiles.length} candidates processed
          </p>
        </div>
      </div>
    </div>
  );
}