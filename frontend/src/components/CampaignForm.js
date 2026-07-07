import React, { useState, useEffect } from 'react';
import { campaignAPI, inventoryAPI } from '../services/api';
import Modal from './Modal';

const getInventoryId = (inventory) => {
  if (!inventory) return null;
  if (typeof inventory === 'object') return inventory._id || inventory.id || null;
  return inventory;
};

const buildMappingsFromCampaign = (campaign) => {
  const adUnits = Array.isArray(campaign?.adUnits) ? campaign.adUnits : [];
  return adUnits.map((adUnit) => {
    const inventoryIds = [
      ...(Array.isArray(adUnit?.inventories) ? adUnit.inventories : []),
      adUnit?.inventory
    ]
      .map(getInventoryId)
      .filter(Boolean)
      .map(String);

    return {
      adUnitId: String(adUnit._id || adUnit.id || ''),
      adUnitName: adUnit.name || 'Untitled Ad Unit',
      inventoryIds: [...new Set(inventoryIds)]
    };
  }).filter((mapping) => mapping.adUnitId);
};

const normalizeMappings = (mappings = []) => mappings.map((mapping) => ({
  adUnitId: String(mapping.adUnitId || ''),
  adUnitName: mapping.adUnitName || 'Untitled Ad Unit',
  inventoryIds: Array.isArray(mapping.inventoryIds)
    ? mapping.inventoryIds.map(String)
    : []
})).filter((mapping) => mapping.adUnitId);

const formatToLocalDateTime = (date) => {
  if (!date) return '';
  const parsedDate = date instanceof Date ? date : new Date(date);
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const hours = String(parsedDate.getHours()).padStart(2, '0');
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getRecommendedStartDate = () => {
  const recommended = new Date();
  recommended.setMinutes(recommended.getMinutes() + 5);
  return formatToLocalDateTime(recommended);
};

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
  const [isAssignmentsModalOpen, setIsAssignmentsModalOpen] = useState(false);

  const isEditingCampaign = Boolean(campaign);
  const isEditingActiveCampaign = Boolean(campaign && campaign.status === 'active');
  const assignmentOptionCount = mappingRows.length * Math.max(inventories.length, 1);
  const assignedAdUnitCount = mappingRows.filter((row) => (inventoryMappings[row.adUnitId] || []).length > 0).length;
  const assignmentSummary = mappingRows.length > 0
    ? `${assignedAdUnitCount} of ${mappingRows.length} ad units assigned`
    : 'No ad units to assign';

  useEffect(() => {
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
        startDate: getRecommendedStartDate(),
        endDate: ''
      });
      setInitialStartDateValue("");
    }
  }, [campaign]);

  useEffect(() => {
    let isActive = true;

    const applyMappings = (mappings) => {
      if (!isActive) return;
      setMappingRows(mappings);

      const nextMappingState = {};
      mappings.forEach((mapping) => {
        nextMappingState[mapping.adUnitId] = [...mapping.inventoryIds];
      });
      setInventoryMappings(nextMappingState);
    };

    const loadSupportData = async () => {
      const fallbackMappings = campaign ? buildMappingsFromCampaign(campaign) : [];

      try {
        const inventoryResponse = await inventoryAPI.getAll();
        if (!isActive) return;
        setInventories(Array.isArray(inventoryResponse.data) ? inventoryResponse.data : []);
      } catch (error) {
        if (!isActive) return;
        setInventories([]);
        setMappingError('Failed to load ad channel assignment data.');
        applyMappings(fallbackMappings);
        return;
      }

      if (!campaign) {
        applyMappings([]);
        setMappingError(null);
        return;
      }

      if (!campaign._id) {
        applyMappings(fallbackMappings);
        setMappingError(null);
        return;
      }

      try {
        const mappingResponse = await campaignAPI.getAdUnitInventories(campaign._id);
        const mappings = normalizeMappings(mappingResponse.data?.mappings || []);
        applyMappings(mappings);
        if (isActive) setMappingError(null);
      } catch (error) {
        applyMappings(fallbackMappings);
        if (isActive) {
          setMappingError(
            fallbackMappings.length > 0
              ? null
              : 'Failed to load ad channel assignment data.'
          );
        }
      }
    };

    loadSupportData();

    return () => {
      isActive = false;
    };
  }, [campaign]);

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();

    if (!formData.name.trim()) newErrors.name = 'Campaign name is required';
    if (!formData.startDate) newErrors.startDate = 'Start date and time is required';
    if (!formData.endDate) newErrors.endDate = 'End date and time is required';

    const startDateChanged = isEditingCampaign && initialStartDateValue && formData.startDate !== initialStartDateValue;

    if (formData.startDate) {
      const startDateTime = new Date(formData.startDate);
      if (!isEditingCampaign && startDateTime < now) {
        newErrors.startDate = 'Start date and time cannot be in the past';
      }
      if (isEditingActiveCampaign && startDateChanged) {
          newErrors.startDate = 'Active campaigns cannot change start date. Pause the campaign first.';
      }
    }

    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (!isEditingCampaign && endDateTime < now) {
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
        newErrors.adUnitInventoryMappings = 'Active campaigns cannot save ad units without ad channel assignments.';
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

      if (!isEditingCampaign || formData.startDate !== initialStartDateValue) {
        submitData.startDate = formData.startDate ? new Date(formData.startDate).toISOString() : '';
      }

      onSubmit(submitData);
    }
  };

  const assignmentContent = (
    <div className={`assignment-popup-list ${assignmentOptionCount > 20 ? 'is-scrollable' : ''}`}>
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
  );

  return (
    <>
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
        <div className="form-group form-full-width">
          <label>Ad Unit Ad Channel Assignments</label>
          <div className="form-popup-summary">
            <span>{assignmentSummary}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsAssignmentsModalOpen(true)}
            >
              Manage Assignments
            </button>
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
    <Modal
      isOpen={isAssignmentsModalOpen}
      title="Ad Unit Ad Channel Assignments"
      onClose={() => setIsAssignmentsModalOpen(false)}
      contentClassName="assignment-editor-modal"
    >
      <div className="assignment-popup-content">
        {assignmentContent}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAssignmentsModalOpen(false)}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
}

export default CampaignForm;
