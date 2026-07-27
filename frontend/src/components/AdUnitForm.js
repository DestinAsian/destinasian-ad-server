import React, { useMemo, useState, useEffect } from "react";
import { adUnitAPI, inventoryAPI } from "../services/api";
import Modal from "./Modal";

const formatToLocalDateTime = (date) => {
  if (!date) return "";
  const parsedDate = date instanceof Date ? date : new Date(date);
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  const hours = String(parsedDate.getHours()).padStart(2, "0");
  const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getRecommendedStartDate = () => {
  const recommended = new Date();
  recommended.setMinutes(recommended.getMinutes() + 5);
  return formatToLocalDateTime(recommended);
};

const STATIC_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const GIF_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

const getFileExtension = (fileName = "") => {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
};

function AdUnitForm({
  adUnit,
  submitting,
  campaignId,
  campaign,
  onSubmit,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    name: "",
    campaignId,
    inventoryIds: [],
    startDate: "",
    endDate: "",
    imageUrl: "",
    clickUrl: "",
  });
  const [errors, setErrors] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [inventoryError, setInventoryError] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [isInventoriesModalOpen, setIsInventoriesModalOpen] = useState(false);
  const [isBannerLibraryModalOpen, setIsBannerLibraryModalOpen] = useState(false);
  const [initialStartDateValue, setInitialStartDateValue] = useState("");
  const [startDateTouched, setStartDateTouched] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [bannerLibrary, setBannerLibrary] = useState([]);
  const [bannerLibraryLoading, setBannerLibraryLoading] = useState(false);
  const [bannerLibraryError, setBannerLibraryError] = useState(null);
  const [bannerLibrarySearch, setBannerLibrarySearch] = useState("");

  useEffect(() => {
    if (adUnit) {
      const formattedStart = formatToLocalDateTime(adUnit.startDate);
      const multiInventories = Array.isArray(adUnit.inventories)
        ? adUnit.inventories
            .map((inventory) => inventory?._id || inventory)
            .filter(Boolean)
        : [];
      const fallbackInventory = adUnit.inventory?._id || adUnit.inventory;

      setFormData({
        name: adUnit.name || "",
        campaignId: adUnit.campaignId || campaignId,
        inventoryIds:
          multiInventories.length > 0
            ? multiInventories
            : fallbackInventory
              ? [fallbackInventory]
              : [],
        startDate: formattedStart,
        endDate: formatToLocalDateTime(adUnit.endDate),
        imageUrl: adUnit.imageUrl || "",
        clickUrl: adUnit.clickUrl || "",
      });
      setInitialStartDateValue(formattedStart);
      setImagePreview(adUnit.imageUrl || null);
    } else {
      const defaultStartDate = getRecommendedStartDate();
      const defaultEndDate = campaign?.endDate
        ? formatToLocalDateTime(campaign.endDate)
        : "";
      setFormData({
        name: "",
        campaignId,
        inventoryIds: [],
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        imageUrl: "",
        clickUrl: "",
      });
      setInitialStartDateValue(defaultStartDate);
      setImagePreview(null);
    }
    setIsInventoriesModalOpen(false);
    setIsBannerLibraryModalOpen(false);
    setInventorySearchQuery("");
    setBannerLibrarySearch("");
    setStartDateTouched(false);
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
        setInventoryError("Failed to load ad channels");
      } finally {
        setInventoryLoading(false);
      }
    };
    loadInventories();
  }, []);

  useEffect(() => {
    let isCurrentRequest = true;

    const loadBannerLibrary = async () => {
      try {
        setBannerLibraryLoading(true);
        const response = await adUnitAPI.getBannerLibrary();
        if (!isCurrentRequest) return;
        setBannerLibrary(response.data?.banners || []);
        setBannerLibraryError(null);
      } catch (err) {
        if (!isCurrentRequest) return;
        setBannerLibrary([]);
        setBannerLibraryError("Failed to load banner library.");
      } finally {
        if (isCurrentRequest) {
          setBannerLibraryLoading(false);
        }
      }
    };

    loadBannerLibrary();

    return () => {
      isCurrentRequest = false;
    };
  }, []);

  const isEditingAdUnit = Boolean(adUnit);
  const isEditingActiveAdUnit = Boolean(adUnit && adUnit.status === "active");

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();
    const oldStartCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (!formData.name.trim()) {
      newErrors.name = "Ad unit name is required";
    }

    if (
      !Array.isArray(formData.inventoryIds) ||
      formData.inventoryIds.length === 0
    ) {
      newErrors.inventoryIds = "At least one ad channel is required";
    }

    if (!formData.startDate) {
      newErrors.startDate = "Start date and time is required";
    }

    if (!formData.endDate) {
      newErrors.endDate = "End date and time is required";
    }

    const startDateChanged =
      isEditingAdUnit &&
      startDateTouched &&
      initialStartDateValue &&
      formData.startDate !== initialStartDateValue;
    const shouldValidateStartDate = !isEditingAdUnit || startDateTouched;

    if (formData.startDate && shouldValidateStartDate) {
      const startDateTime = new Date(formData.startDate);
      if (!isEditingAdUnit && startDateTime < oldStartCutoff) {
        newErrors.startDate =
          "Start date cannot be more than 1 day in the past";
      }
      if (
        isEditingActiveAdUnit &&
        startDateChanged
      ) {
        newErrors.startDate =
          "Active ad units cannot change start date. Pause the ad unit first.";
      }
    }

    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (!isEditingAdUnit && endDateTime < now) {
        newErrors.endDate = "End date and time must be in the future";
      }
    }

    if (formData.startDate && formData.endDate) {
      const startDateTime = new Date(formData.startDate);
      const endDateTime = new Date(formData.endDate);
      if (startDateTime > endDateTime) {
        newErrors.endDate =
          "End date and time must be after start date and time";
      }
    }

    if (campaign) {
      const campaignStart = new Date(campaign.startDate);

      if (formData.startDate && shouldValidateStartDate) {
        const startDateTime = new Date(formData.startDate);
        if (startDateTime < campaignStart) {
          newErrors.startDate =
            "Start date and time cannot be before campaign start";
        }
      }
    }

    if (!formData.imageUrl) {
      newErrors.imageUrl = "1:1 image is required";
    }

    if (!formData.clickUrl.trim()) {
      newErrors.clickUrl = "Click-through URL is required";
    } else {
      try {
        new URL(formData.clickUrl);
      } catch (err) {
        newErrors.clickUrl =
          "Please enter a valid URL (e.g., https://example.com)";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "startDate") {
      setStartDateTouched(true);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
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
          : [...prev.inventoryIds, inventoryId],
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

  const selectedInventoriesCount = Array.isArray(formData.inventoryIds)
    ? formData.inventoryIds.length
    : 0;
  const inventorySummaryLabel =
    selectedInventoriesCount > 0
      ? `${selectedInventoriesCount} ${selectedInventoriesCount === 1 ? "ad channel" : "ad channels"} selected`
      : "No ad channels selected";
  const normalizedInventorySearch = String(inventorySearchQuery || "").trim().toLowerCase();
  const visibleInventories = useMemo(() => {
    if (!normalizedInventorySearch) return inventories;
    return inventories.filter((inventory) =>
      String(inventory?.name || "").toLowerCase().includes(normalizedInventorySearch)
    );
  }, [inventories, normalizedInventorySearch]);
  const normalizedBannerLibrarySearch = String(bannerLibrarySearch || "").trim().toLowerCase();
  const visibleBannerLibrary = useMemo(() => {
    if (!normalizedBannerLibrarySearch) return bannerLibrary;
    return bannerLibrary.filter((banner) => {
      const searchableText = [
        banner?.name,
        banner?.campaign?.name,
        banner?.mimeType
      ].filter(Boolean).join(" ").toLowerCase();
      return searchableText.includes(normalizedBannerLibrarySearch);
    });
  }, [bannerLibrary, normalizedBannerLibrarySearch]);

  const applyImageSelection = (imageUrl) => {
    setFormData((prev) => ({
      ...prev,
      imageUrl,
    }));
    setImagePreview(imageUrl);
    setIsBannerLibraryModalOpen(false);
    setImageError(null);
    if (errors.imageUrl) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.imageUrl;
        return next;
      });
    }
  };

  const processImageFile = (file, resetInput) => {
    setImageError(null);

    if (!file) return;

    const fileExtension = getFileExtension(file.name);
    const isAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.includes(fileExtension);

    if (!isAllowedType && !isAllowedExtension) {
      setImageError("Only PNG, JPG, JPEG, WebP, and GIF files are allowed.");
      if (resetInput) resetInput();
      return;
    }

    const isGif = file.type === "image/gif" || fileExtension === ".gif";
    const maxFileSize = isGif ? GIF_MAX_BYTES : STATIC_IMAGE_MAX_BYTES;
    if (file.size > maxFileSize) {
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
      setImageError(
        isGif
          ? `GIF files must be 10MB or smaller. Your file is ${fileSizeMB}MB.`
          : `PNG, JPG, JPEG, and WebP files must be 1MB or smaller. Your file is ${fileSizeMB}MB.`,
      );
      if (resetInput) resetInput();
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (img.width === img.height) {
          applyImageSelection(event.target.result);
        } else {
          setImageError(
            `Image must be 1:1 (square). Your image is ${img.width}x${img.height}. Please crop it to a square.`,
          );
          if (resetInput) resetInput();
        }
      };
      img.onerror = () => {
        setImageError("Failed to load image. Please try another image.");
        if (resetInput) resetInput();
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      setImageError("Failed to read image file");
      if (resetInput) resetInput();
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e) => {
    processImageFile(e.target.files[0], () => {
      e.target.value = "";
    });
  };

  const handleImageDragOver = (event) => {
    event.preventDefault();
    if (!submitting) {
      setIsImageDragActive(true);
    }
  };

  const handleImageDragLeave = () => {
    setIsImageDragActive(false);
  };

  const handleImageDrop = (event) => {
    event.preventDefault();
    setIsImageDragActive(false);

    if (submitting) return;

    processImageFile(event.dataTransfer.files[0]);
  };

  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      imageUrl: "",
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
        endDate: formData.endDate
          ? new Date(formData.endDate).toISOString()
          : "",
        imageUrl: formData.imageUrl,
        clickUrl: formData.clickUrl,
      };

      if (
        !isEditingAdUnit ||
        (startDateTouched && formData.startDate !== initialStartDateValue)
      ) {
        submitData.startDate = formData.startDate
          ? new Date(formData.startDate).toISOString()
          : "";
      }
      onSubmit(submitData);
    }
  };

  const inventorySelectorContent = (
    <div className={`assignment-popup-list ${visibleInventories.length > 20 ? "is-scrollable" : ""}`}>
      <div className="inventory-selector-search-wrap">
        <input
          type="search"
          className="inventory-selector-search"
          placeholder="Search ad channels..."
          value={inventorySearchQuery}
          onChange={(event) => setInventorySearchQuery(event.target.value)}
        />
      </div>
      {inventoryLoading ? (
        <p className="inventory-selection-state">
          Loading ad channels...
        </p>
      ) : inventories.length === 0 ? (
        <p className="inventory-selection-state">
          No ad channels available.
        </p>
      ) : visibleInventories.length === 0 ? (
        <p className="inventory-selection-state">
          No Ad Channels found.
        </p>
      ) : (
        <div
          className="selectable-checkbox-list inventory-checkbox-list"
          role="group"
          aria-label="Select ad channels"
        >
          {visibleInventories.map((inventory) => {
            const inventoryId = String(inventory._id);
            const isSelected =
              formData.inventoryIds.includes(inventoryId);
            const checkboxId = `adunit-inventory-${inventoryId}`;
            const metaItems = [];
            if (inventory.key) metaItems.push(`Key: ${inventory.key}`);
            if (inventory.isActive !== undefined)
              metaItems.push(
                inventory.isActive ? "Active" : "Inactive",
              );

            return (
              <label
                key={inventoryId}
                htmlFor={checkboxId}
                className={`selectable-checkbox-item inventory-checkbox-item ${isSelected ? "selected" : ""}`}
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleInventory(inventoryId)}
                  disabled={submitting}
                />
                <span className="inventory-checkbox-content">
                  <span className="inventory-checkbox-title">
                    {inventory.name}
                  </span>
                  {metaItems.length > 0 && (
                    <span className="inventory-checkbox-meta">
                      {metaItems.join(" • ")}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  const bannerLibraryContent = (
    <div className="banner-library-panel" aria-label="Banner Ads Library">
      <div className="banner-library-header">
        <div>
          <span className="banner-library-title">Banner Ads Library</span>
          <span className="banner-library-helper">
            Choose an existing uploaded banner, or close this window and upload new material.
          </span>
        </div>
        {bannerLibrary.length > 0 && (
          <input
            type="search"
            className="banner-library-search"
            placeholder="Search banners..."
            value={bannerLibrarySearch}
            onChange={(event) => setBannerLibrarySearch(event.target.value)}
            disabled={submitting}
          />
        )}
      </div>
      {bannerLibraryLoading ? (
        <p className="banner-library-state">Loading banner library...</p>
      ) : bannerLibraryError ? (
        <p className="banner-library-state banner-library-state-error">
          {bannerLibraryError}
        </p>
      ) : bannerLibrary.length === 0 ? (
        <p className="banner-library-state">
          No saved banners yet. Upload a new banner to add one.
        </p>
      ) : visibleBannerLibrary.length === 0 ? (
        <p className="banner-library-state">No banners found.</p>
      ) : (
        <div className="banner-library-list">
          {visibleBannerLibrary.map((banner) => {
            const bannerId = String(banner._id || banner.imageUrl);
            const isSelected = formData.imageUrl === banner.imageUrl;
            return (
              <button
                key={bannerId}
                type="button"
                className={`banner-library-item${isSelected ? " is-selected" : ""}`}
                onClick={() => applyImageSelection(banner.imageUrl)}
                disabled={submitting}
              >
                <span className="banner-library-thumb">
                  <img
                    src={banner.imageUrl}
                    alt={banner.name ? `${banner.name} banner` : "Saved banner"}
                  />
                </span>
                <span className="banner-library-info">
                  <span className="banner-library-name">
                    {banner.name || "Untitled banner"}
                  </span>
                  <span className="banner-library-meta">
                    {banner.campaign?.name || "No campaign"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
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
          className={errors.name ? "error" : ""}
        />
        {errors.name && <span className="error-message">{errors.name}</span>}
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
            className={errors.startDate ? "error" : ""}
          />
          {errors.startDate && (
            <span className="error-message">{errors.startDate}</span>
          )}
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
            className={errors.endDate ? "error" : ""}
          />
          {errors.endDate && (
            <span className="error-message">{errors.endDate}</span>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="image">Ad Image (1:1 Square) *</label>
          <div className="image-upload-container">
            <div className="image-upload-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm banner-library-open-button"
                onClick={() => setIsBannerLibraryModalOpen(true)}
                disabled={submitting}
              >
                Library
              </button>
            </div>
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
              <label
                htmlFor="image"
                className={`image-upload-box${isImageDragActive ? " is-drag-active" : ""}`}
                onDragOver={handleImageDragOver}
                onDragLeave={handleImageDragLeave}
                onDrop={handleImageDrop}
              >
                <div className="upload-icon">📸</div>
                <div className="upload-text">Drag and drop image here, or click to upload</div>
                <div className="upload-hint">PNG, JPG, WebP up to 1MB. GIF up to 10MB.</div>
              </label>
            )}
            <input
              type="file"
              id="image"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageUpload}
              disabled={submitting}
              style={{ display: "none" }}
            />
          </div>
          {imageError && <span className="error-message">{imageError}</span>}
          {errors.imageUrl && (
            <span className="error-message">{errors.imageUrl}</span>
          )}
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
            className={errors.clickUrl ? "error" : ""}
          />
          {errors.clickUrl && (
            <span className="error-message">{errors.clickUrl}</span>
          )}
        </div>
      </div>

      <div className="form-group form-full-width">
        <div className="inventory-selector-panel inventory-selector-summary-panel">
          <button
            type="button"
            className="inventory-selector-toggle"
            onClick={() => setIsInventoriesModalOpen(true)}
          >
            <span className="inventory-selector-title-wrap">
              <span className="inventory-selector-title">Ad Channels *</span>
              <span className="inventory-selector-summary">
                {inventorySummaryLabel}
              </span>
            </span>
            <span className="btn btn-secondary btn-sm">Manage</span>
          </button>
        </div>
        {inventoryError && (
          <span className="error-message">{inventoryError}</span>
        )}
        {errors.inventoryIds && (
          <span className="error-message">{errors.inventoryIds}</span>
        )}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? "Saving..."
            : adUnit
              ? "Update Ad Unit"
              : "Create Ad Unit"}
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
    <Modal
      isOpen={isInventoriesModalOpen}
      title="Ad Channel Assignments"
      onClose={() => setIsInventoriesModalOpen(false)}
      contentClassName="assignment-editor-modal"
    >
      <div className="assignment-popup-content">
        {inventorySelectorContent}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsInventoriesModalOpen(false)}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
    <Modal
      isOpen={isBannerLibraryModalOpen}
      title="Banner Ads Library"
      onClose={() => setIsBannerLibraryModalOpen(false)}
      contentClassName="banner-library-modal"
    >
      {bannerLibraryContent}
    </Modal>
    </>
  );
}

export default AdUnitForm;
