import React, { useState, useEffect } from 'react';
import { inventoryAPI } from '../services/api';

function AdUnitForm({ adUnit, submitting, campaignId, campaign, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    campaignId,
    inventoryIds: [],
    startDate: '',
    endDate: '',
    imageUrl: '',
    clickUrl: ''
  });
  const [errors, setErrors] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [inventories, setInventories] = useState([]);
  const [inventoryError, setInventoryError] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [isInventoriesExpanded, setIsInventoriesExpanded] = useState(false);
  const [initialStartDateValue, setInitialStartDateValue] = useState("");

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

    if (adUnit) {
      const formattedStart = formatToLocalDateTime(adUnit.startDate);
      const multiInventories = Array.isArray(adUnit.inventories)
        ? adUnit.inventories.map((inventory) => inventory?._id || inventory).filter(Boolean)
        : [];
      const fallbackInventory = adUnit.inventory?._id || adUnit.inventory;

      setFormData({
        name: adUnit.name || '',
        campaignId: adUnit.campaignId || campaignId,
        inventoryIds: multiInventories.length > 0 ? multiInventories : (fallbackInventory ? [fallbackInventory] : []),
        startDate: formattedStart,
        endDate: formatToLocalDateTime(adUnit.endDate),
        imageUrl: adUnit.imageUrl || '',
        clickUrl: adUnit.clickUrl || ''
      });
      setInitialStartDateValue(formattedStart);
      setImagePreview(adUnit.imageUrl || null);
    } else {
      const defaultStartDate = campaign?.startDate ? formatToLocalDateTime(campaign.startDate) : '';
      const defaultEndDate = campaign?.endDate ? formatToLocalDateTime(campaign.endDate) : '';
      setFormData({
        name: '',
        campaignId,
        inventoryIds: [],
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        imageUrl: '',
        clickUrl: ''
      });
      setInitialStartDateValue(defaultStartDate);
      setImagePreview(null);
    }
    setIsInventoriesExpanded(false);
    setErrors({});
    setImageError(null);
  }, [adUnit, campaignId, campaign]);

  useEffect(() => {
    const loadInventories = async () => {
      try {
        setInventoryLoading(true);
        const response = await inventoryAPI.getAll();
        setInventories(response.data || []);
        setInventoryError(null);
      } catch (err) {
        setInventoryError('Failed to load inventories');
      } finally {
        setInventoryLoading(false);
      }
    };
    loadInventories();
  }, []);

  const isEditingActiveAdUnit = Boolean(adUnit && adUnit.status === 'active');

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();

    if (!formData.name.trim()) {
      newErrors.name = 'Ad unit name is required';
    }

    if (!Array.isArray(formData.inventoryIds) || formData.inventoryIds.length === 0) {
      newErrors.inventoryIds = 'At least one inventory is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date and time is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date and time is required';
    }

    if (formData.startDate) {
      const startDateTime = new Date(formData.startDate);
      if (!isEditingActiveAdUnit && startDateTime < now) {
        newErrors.startDate = 'Start date and time cannot be in the past';
      }
      if (isEditingActiveAdUnit && initialStartDateValue && formData.startDate !== initialStartDateValue) {
          newErrors.startDate = 'Active ad units cannot change start date. Pause the ad unit first.';
      }
    }

    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (!isEditingActiveAdUnit && endDateTime < now) {
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

    if (campaign) {
      const campaignStart = new Date(campaign.startDate);
      const campaignEnd = new Date(campaign.endDate);

      if (formData.startDate) {
        const startDateTime = new Date(formData.startDate);
        if (startDateTime < campaignStart) {
          newErrors.startDate = 'Start date and time cannot be before campaign start';
        }
      }

      if (formData.endDate) {
        const endDateTime = new Date(formData.endDate);
        if (endDateTime > campaignEnd) {
          newErrors.endDate = 'End date and time cannot be after campaign end';
        }
      }
    }

    if (!formData.imageUrl) {
      newErrors.imageUrl = '1:1 image is required';
    }

    if (!formData.clickUrl.trim()) {
      newErrors.clickUrl = 'Click-through URL is required';
    } else {
      try {
        new URL(formData.clickUrl);
      } catch (err) {
        newErrors.clickUrl = 'Please enter a valid URL (e.g., https://example.com)';
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
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const toggleInventory = (inventoryId) => {
    setFormData((prev) => {
      const exists = prev.inventoryIds.includes(inventoryId);
      return {
        ...prev,
        inventoryIds: exists
          ? prev.inventoryIds.filter((id) => id !== inventoryId)
          : [...prev.inventoryIds, inventoryId]
      };
    });

    if (errors.inventoryIds) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.inventoryIds;
        return next;
      });
    }
  };

  const selectedInventoriesCount = Array.isArray(formData.inventoryIds) ? formData.inventoryIds.length : 0;
  const inventorySummaryLabel = selectedInventoriesCount > 0
    ? `${selectedInventoriesCount} ${selectedInventoriesCount === 1 ? 'inventory' : 'inventories'} selected`
    : 'No inventories selected';

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    setImageError(null);

    if (!file) return;

    const maxFileSize = 1048576;
    if (file.size > maxFileSize) {
      const fileSizeMB = (file.size / 1048576).toFixed(1);
      setImageError(`Image must be under 1MB. Your file is ${fileSizeMB}MB.`);
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (img.width === img.height) {
          setFormData((prev) => ({
            ...prev,
            imageUrl: event.target.result
          }));
          setImagePreview(event.target.result);
          if (errors.imageUrl) {
            setErrors((prev) => {
              const next = { ...prev };
              delete next.imageUrl;
              return next;
            });
          }
        } else {
          setImageError(`Image must be 1:1 (square). Your image is ${img.width}x${img.height}. Please crop it to a square.`);
          e.target.value = '';
        }
      };
      img.onerror = () => {
        setImageError('Failed to load image. Please try another image.');
        e.target.value = '';
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      setImageError('Failed to read image file');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      imageUrl: ''
    }));
    setImagePreview(null);
    setImageError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const normalizedInventoryIds = [...new Set(formData.inventoryIds)];
      const submitData = {
        name: formData.name,
        campaign: formData.campaignId,
        inventory: normalizedInventoryIds[0],
        inventories: normalizedInventoryIds,
        inventoryIds: normalizedInventoryIds,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
        imageUrl: formData.imageUrl,
        clickUrl: formData.clickUrl
      };

      if (!isEditingActiveAdUnit || formData.startDate !== initialStartDateValue) {
        submitData.startDate = formData.startDate ? new Date(formData.startDate).toISOString() : '';
      }
      onSubmit(submitData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ad-unit-form">
      <div className="form-group">
        <label htmlFor="name">Ad Unit Name *</label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Homepage Banner"
          className={errors.name ? 'error' : ''}
        />
        {errors.name && <span className="error-message">{errors.name}</span>}
      </div>

      <div className="form-group">
        <div className={`inventory-selector-panel ${isInventoriesExpanded ? 'is-expanded' : ''}`}>
          <button
            type="button"
            className="inventory-selector-toggle"
            onClick={() => setIsInventoriesExpanded((prev) => !prev)}
            aria-expanded={isInventoriesExpanded}
            aria-controls="adunit-inventory-selector-body"
          >
            <span className="inventory-selector-title-wrap">
              <span className="inventory-selector-title">Inventories *</span>
              <span className="inventory-selector-summary">{inventorySummaryLabel}</span>
            </span>
            <span className="inventory-selector-icon" aria-hidden="true">
              {isInventoriesExpanded ? '▾' : '▸'}
            </span>
          </button>

          {isInventoriesExpanded && (
            <div id="adunit-inventory-selector-body" className="inventory-selector-body">
              {inventoryLoading ? (
                <p className="inventory-selection-state">Loading inventories...</p>
              ) : inventories.length === 0 ? (
                <p className="inventory-selection-state">No inventories available.</p>
              ) : (
                <div className="selectable-checkbox-list inventory-checkbox-list" role="group" aria-label="Select inventories">
                  {inventories.map((inventory) => {
                    const inventoryId = String(inventory._id);
                    const isSelected = formData.inventoryIds.includes(inventoryId);
                    const checkboxId = `adunit-inventory-${inventoryId}`;
                    const metaItems = [];
                    if (inventory.key) metaItems.push(`Key: ${inventory.key}`);
                    if (inventory.isActive !== undefined) metaItems.push(inventory.isActive ? 'Active' : 'Inactive');

                    return (
                      <label
                        key={inventoryId}
                        htmlFor={checkboxId}
                        className={`selectable-checkbox-item inventory-checkbox-item ${isSelected ? 'selected' : ''}`}
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleInventory(inventoryId)}
                          disabled={submitting}
                        />
                        <span className="inventory-checkbox-content">
                          <span className="inventory-checkbox-title">{inventory.name}</span>
                          {metaItems.length > 0 && (
                            <span className="inventory-checkbox-meta">{metaItems.join(' • ')}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {inventoryError && <span className="error-message">{inventoryError}</span>}
        {errors.inventoryIds && <span className="error-message">{errors.inventoryIds}</span>}
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

      <div className="form-group">
        <label htmlFor="image">Ad Image (1:1 Square) *</label>
        <div className="image-upload-container">
          {imagePreview ? (
            <div className="image-preview">
              <img src={imagePreview} alt="Ad preview" />
              <button
                type="button"
                className="btn-remove-image"
                onClick={removeImage}
                disabled={submitting}
              >
                ✕ Remove
              </button>
            </div>
          ) : (
            <label htmlFor="image" className="image-upload-box">
              <div className="upload-icon">📸</div>
              <div className="upload-text">Click to upload 1:1 image</div>
              <div className="upload-hint">PNG, JPG up to 1MB</div>
            </label>
          )}
          <input
            type="file"
            id="image"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={submitting}
            style={{ display: 'none' }}
          />
        </div>
        {imageError && <span className="error-message">{imageError}</span>}
        {errors.imageUrl && <span className="error-message">{errors.imageUrl}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="clickUrl">Click-Through URL *</label>
        <input
          type="url"
          id="clickUrl"
          name="clickUrl"
          value={formData.clickUrl}
          onChange={handleChange}
          placeholder="e.g., https://example.com"
          className={errors.clickUrl ? 'error' : ''}
        />
        {errors.clickUrl && <span className="error-message">{errors.clickUrl}</span>}
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : (adUnit ? 'Update Ad Unit' : 'Create Ad Unit')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default AdUnitForm;
