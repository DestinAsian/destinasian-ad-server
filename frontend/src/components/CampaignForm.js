import React, { useState, useEffect } from 'react';

function CampaignForm({ campaign, onSubmit, onCancel, submitting = false }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (campaign) {
      // Convert ISO datetime to datetime-local format (YYYY-MM-DDTHH:mm)
      const formatToLocalDateTime = (isoDate) => {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      setFormData({
        name: campaign.name || '',
        description: campaign.description || '',
        startDate: formatToLocalDateTime(campaign.startDate),
        endDate: formatToLocalDateTime(campaign.endDate)
      });
    }
  }, [campaign]);

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();

    if (!formData.name.trim()) newErrors.name = 'Campaign name is required';
    if (!formData.startDate) newErrors.startDate = 'Start date and time is required';
    if (!formData.endDate) newErrors.endDate = 'End date and time is required';
    
    if (formData.startDate) {
      const startDateTime = new Date(formData.startDate);
      if (startDateTime < now) {
        newErrors.startDate = 'Start date and time cannot be in the past';
      }
    }
    
    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (endDateTime < now) {
        newErrors.endDate = 'End date and time cannot be in the past';
      }
    }
    
    if (formData.startDate && formData.endDate) {
      const startDateTime = new Date(formData.startDate);
      const endDateTime = new Date(formData.endDate);
      if (startDateTime > endDateTime) {
        newErrors.endDate = 'End date and time must be after start date and time';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Convert datetime-local values to ISO format for backend
      const submitData = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : ''
      };
      onSubmit(submitData);
    }
  };

  return (
    <form className="campaign-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="name">Campaign Name *</label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Enter campaign name"
          className={errors.name ? 'error' : ''}
        />
        {errors.name && <span className="error-message">{errors.name}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Enter campaign description"
          rows="3"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="startDate">Start Date & Time *</label>
          <input
            type="datetime-local"
            id="startDate"
            name="startDate"
            value={formData.startDate}
            onChange={handleChange}
            step="1800"
            className={errors.startDate ? 'error' : ''}
          />
          {errors.startDate && <span className="error-message">{errors.startDate}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="endDate">End Date & Time *</label>
          <input
            type="datetime-local"
            id="endDate"
            name="endDate"
            value={formData.endDate}
            onChange={handleChange}
            step="1800"
            className={errors.endDate ? 'error' : ''}
          />
          {errors.endDate && <span className="error-message">{errors.endDate}</span>}
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : (campaign ? 'Update Campaign' : 'Create Campaign')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default CampaignForm;
