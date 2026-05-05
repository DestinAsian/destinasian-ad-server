import React, { useState, useEffect } from 'react';
import { campaignAPI, inventoryAPI } from '../services/api';

function CampaignForm({ campaign, onSubmit, onCancel, submitting = false }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: ''
  });
  const [errors, setErrors] = useState({});
  const [inventories, setInventories] = useState([]);
  const [inventoryMappings, setInventoryMappings] = useState({});
  const [mappingRows, setMappingRows] = useState([]);
  const [mappingError, setMappingError] = useState(null);
  const [initialStartDateValue, setInitialStartDateValue] = useState("");

  const isEditingActiveCampaign = Boolean(campaign && campaign.status === 'active');

  useEffect(() => {
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

    if (campaign) {
      const formattedStart = formatToLocalDateTime(campaign.startDate);
      setFormData({
        name: campaign.name || '',
        description: campaign.description || '',
        startDate: formattedStart,
        endDate: formatToLocalDateTime(campaign.endDate)
      });
      setInitialStartDateValue(formattedStart);
    } else {
      setFormData({
        name: '',
        description: '',
        startDate: '',
        endDate: ''
      });
      setInitialStartDateValue("");
    }
  }, [campaign]);

  useEffect(() => {
    const loadSupportData = async () => {
      try {
        const [inventoryResponse, mappingResponse] = await Promise.all([
          inventoryAPI.getAll(),
          campaign ? campaignAPI.getAdUnitInventories(campaign._id) : Promise.resolve({ data: { mappings: [] } })
        ]);

        setInventories(inventoryResponse.data || []);

        const mappings = (mappingResponse.data?.mappings || []).map((mapping) => ({
          adUnitId: mapping.adUnitId,
          adUnitName: mapping.adUnitName,
          inventoryIds: Array.isArray(mapping.inventoryIds) ? mapping.inventoryIds : []
        }));
        setMappingRows(mappings);

        const nextMappingState = {};
        mappings.forEach((mapping) => {
          nextMappingState[mapping.adUnitId] = [...mapping.inventoryIds];
        });
        setInventoryMappings(nextMappingState);
        setMappingError(null);
      } catch (error) {
        setMappingError('Failed to load inventory assignment data.');
      }
    };

    loadSupportData();
  }, [campaign]);

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();

    if (!formData.name.trim()) newErrors.name = 'Campaign name is required';
    if (!formData.startDate) newErrors.startDate = 'Start date and time is required';
    if (!formData.endDate) newErrors.endDate = 'End date and time is required';

    if (formData.startDate) {
      const startDateTime = new Date(formData.startDate);
      if (!isEditingActiveCampaign && startDateTime < now) {
        newErrors.startDate = 'Start date and time cannot be in the past';
      }
      if (isEditingActiveCampaign && initialStartDateValue && formData.startDate !== initialStartDateValue) {
          newErrors.startDate = 'Active campaigns cannot change start date. Pause the campaign first.';
      }
    }

    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (!isEditingActiveCampaign && endDateTime < now) {
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

    if (isEditingActiveCampaign && mappingRows.length > 0) {
      const unassigned = mappingRows.filter((row) => {
        const assigned = inventoryMappings[row.adUnitId] || [];
        return assigned.length === 0;
      });
      if (unassigned.length > 0) {
        newErrors.adUnitInventoryMappings = 'Active campaigns cannot save ad units without inventory assignments.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const toggleInventoryMapping = (adUnitId, inventoryId) => {
    setInventoryMappings((prev) => {
      const current = prev[adUnitId] || [];
      const exists = current.includes(inventoryId);
      const next = exists
        ? current.filter((id) => id !== inventoryId)
        : [...current, inventoryId];

      return {
        ...prev,
        [adUnitId]: next
      };
    });

    if (errors.adUnitInventoryMappings) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.adUnitInventoryMappings;
        return next;
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const mappings = mappingRows.map((row) => ({
        adUnitId: row.adUnitId,
        inventoryIds: [...new Set(inventoryMappings[row.adUnitId] || [])]
      }));

      const submitData = {
        ...formData,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
        adUnitInventoryMappings: mappings
      };

      if (!isEditingActiveCampaign || formData.startDate !== initialStartDateValue) {
        submitData.startDate = formData.startDate ? new Date(formData.startDate).toISOString() : '';
      }

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

      {campaign && (
        <div className="form-group">
          <label>Ad Unit Inventory Assignments</label>
          <div className="campaign-mapping-section">
            {mappingError && <span className="error-message">{mappingError}</span>}
            {!mappingError && mappingRows.length === 0 && (
              <p className="no-data">No ad units in this campaign yet.</p>
            )}
            {mappingRows.map((row) => (
              <div key={row.adUnitId} className="campaign-mapping-row">
                <div className="campaign-mapping-title">{row.adUnitName}</div>
                <div className="inventory-mapping-grid">
                  {inventories.map((inventory) => {
                    const checked = (inventoryMappings[row.adUnitId] || []).includes(inventory._id);
                    return (
                      <label key={`${row.adUnitId}-${inventory._id}`} className={`inventory-mapping-pill ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInventoryMapping(row.adUnitId, inventory._id)}
                        />
                        <span>{inventory.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {errors.adUnitInventoryMappings && <span className="error-message">{errors.adUnitInventoryMappings}</span>}
        </div>
      )}

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
