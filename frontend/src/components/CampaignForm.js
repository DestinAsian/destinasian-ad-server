import React, { useState, useEffect, useMemo } from "react";
import { campaignAPI, inventoryAPI } from "../services/api";
import { sortAlphabetically, sortSelectedFirst } from "../utils/listOrdering";

const getInventoryId = (inventory) => {
  if (!inventory) return null;
  if (typeof inventory === "object")
    return inventory._id || inventory.id || null;
  return inventory;
};

const buildMappingsFromCampaign = (campaign) => {
  const adUnits = Array.isArray(campaign?.adUnits) ? campaign.adUnits : [];
  return adUnits
    .map((adUnit) => {
      const inventoryIds = [
        ...(Array.isArray(adUnit?.inventories) ? adUnit.inventories : []),
        adUnit?.inventory,
      ]
        .map(getInventoryId)
        .filter(Boolean)
        .map(String);

      return {
        adUnitId: String(adUnit._id || adUnit.id || ""),
        adUnitName: adUnit.name || "Untitled Ad Unit",
        inventoryIds: [...new Set(inventoryIds)],
      };
    })
    .filter((mapping) => mapping.adUnitId);
};

const normalizeMappings = (mappings = []) =>
  mappings
    .map((mapping) => ({
      adUnitId: String(mapping.adUnitId || ""),
      adUnitName: mapping.adUnitName || "Untitled Ad Unit",
      inventoryIds: Array.isArray(mapping.inventoryIds)
        ? mapping.inventoryIds.map(String)
        : [],
    }))
    .filter((mapping) => mapping.adUnitId);

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

function CampaignForm({
  campaign,
  onSubmit,
  onCancel,
  adUnitManagementContent,
  statusOverride,
  submitting = false,
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
  });
  const [errors, setErrors] = useState({});
  const [inventories, setInventories] = useState([]);
  const [inventoryMappings, setInventoryMappings] = useState({});
  const [mappingRows, setMappingRows] = useState([]);
  const [mappingError, setMappingError] = useState(null);
  const [assignmentStatus, setAssignmentStatus] = useState(
    campaign ? "loading" : "success",
  );
  const [initialStartDateValue, setInitialStartDateValue] = useState("");

  const isEditingCampaign = Boolean(campaign);
  const effectiveCampaignStatus = statusOverride || campaign?.status;
  const assignmentOptionCount =
    mappingRows.length * Math.max(inventories.length, 1);
  const assignedAdUnitCount = mappingRows.filter(
    (row) => (inventoryMappings[row.adUnitId] || []).length > 0,
  ).length;
  const sortedMappingRows = useMemo(
    () => sortAlphabetically(mappingRows, (row) => row.adUnitName),
    [mappingRows],
  );
  const assignmentSummary =
    assignmentStatus === "loading"
      ? "Loading assignments…"
      : assignmentStatus === "error"
        ? "Assignments temporarily unavailable"
        : mappingRows.length > 0
          ? `${assignedAdUnitCount} of ${mappingRows.length} ad units assigned`
          : "No ad units to assign";

  useEffect(() => {
    if (campaign) {
      const formattedStart = formatToLocalDateTime(campaign.startDate);
      setFormData({
        name: campaign.name || "",
        description: campaign.description || "",
        startDate: formattedStart,
        endDate: formatToLocalDateTime(campaign.endDate),
      });
      setInitialStartDateValue(formattedStart);
    } else {
      setFormData({
        name: "",
        description: "",
        startDate: getRecommendedStartDate(),
        endDate: "",
      });
      setInitialStartDateValue("");
    }
    // Keep in-progress form edits stable when the surrounding list refreshes
    // and replaces the campaign object with a newer summary instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?._id]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    setAssignmentStatus(campaign ? "loading" : "success");
    setMappingError(null);

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
      const fallbackMappings = campaign
        ? buildMappingsFromCampaign(campaign)
        : [];

      try {
        const inventoryResponse = await inventoryAPI.getAll(undefined, {
          signal: controller.signal,
        });
        if (!isActive) return;
        setInventories(
          Array.isArray(inventoryResponse.data) ? inventoryResponse.data : [],
        );
      } catch (error) {
        if (error?.code === "ERR_CANCELED") return;
        if (!isActive) return;
        setInventories([]);
        setMappingError("Failed to load ad channel assignment data.");
        setAssignmentStatus("error");
        applyMappings(fallbackMappings);
        return;
      }

      if (!campaign) {
        applyMappings([]);
        setMappingError(null);
        setAssignmentStatus("success");
        return;
      }

      if (!campaign._id) {
        applyMappings(fallbackMappings);
        setMappingError(null);
        setAssignmentStatus("success");
        return;
      }

      try {
        const mappingResponse = await campaignAPI.getAdUnitInventories(
          campaign._id,
          { signal: controller.signal },
        );
        const mappings = normalizeMappings(
          mappingResponse.data?.mappings || [],
        );
        applyMappings(mappings);
        if (isActive) {
          setMappingError(null);
          setAssignmentStatus("success");
        }
      } catch (error) {
        if (error?.code === "ERR_CANCELED") return;
        applyMappings(fallbackMappings);
        if (isActive) {
          setAssignmentStatus("error");
          setMappingError(
            fallbackMappings.length > 0
              ? null
              : "Failed to load ad channel assignment data.",
          );
        }
      }
    };

    loadSupportData();

    return () => {
      isActive = false;
      controller.abort();
    };
    // Assignment support data belongs to the editor session for this campaign.
    // A list refresh must not overwrite checkbox changes already made by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?._id]);

  const validateForm = () => {
    const newErrors = {};
    const now = new Date();

    if (!formData.name.trim()) newErrors.name = "Campaign name is required";
    if (!formData.startDate)
      newErrors.startDate = "Start date and time is required";
    if (!formData.endDate) newErrors.endDate = "End date and time is required";

    const startDateChanged =
      isEditingCampaign &&
      initialStartDateValue &&
      formData.startDate !== initialStartDateValue;

    if (formData.startDate) {
      const startDateTime = new Date(formData.startDate);
      if (!isEditingCampaign && startDateTime < now) {
        newErrors.startDate = "Start date and time cannot be in the past";
      }
      if (effectiveCampaignStatus === "active" && startDateChanged) {
        newErrors.startDate =
          "Active campaigns cannot change start date. Pause the campaign first.";
      }
    }

    if (formData.endDate) {
      const endDateTime = new Date(formData.endDate);
      if (!isEditingCampaign && endDateTime < now) {
        newErrors.endDate = "End date and time cannot be in the past";
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
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
        [adUnitId]: next,
      };
    });

  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const mappings = mappingRows.map((row) => ({
        adUnitId: row.adUnitId,
        inventoryIds: [...new Set(inventoryMappings[row.adUnitId] || [])],
      }));

      const submitData = {
        ...formData,
        endDate: formData.endDate
          ? new Date(formData.endDate).toISOString()
          : "",
      };

      if (assignmentStatus === "success") {
        submitData.adUnitInventoryMappings = mappings;
      }

      if (!isEditingCampaign || formData.startDate !== initialStartDateValue) {
        submitData.startDate = formData.startDate
          ? new Date(formData.startDate).toISOString()
          : "";
      }

      onSubmit(submitData);
    }
  };

  const assignmentContent = (
    <div
      className={`assignment-popup-list ${assignmentOptionCount > 20 ? "is-scrollable" : ""}`}
    >
      {assignmentStatus === "loading" && (
        <p className="assignment-loading" role="status">Loading assignments…</p>
      )}
      {mappingError && <span className="error-message">{mappingError}</span>}
      {assignmentStatus === "success" && mappingRows.length === 0 && (
        <p className="no-data">No ad units in this campaign yet.</p>
      )}
      {sortedMappingRows.map((row) => (
        <div key={row.adUnitId} className="campaign-mapping-row">
          <div className="campaign-mapping-title">{row.adUnitName}</div>
          <div className="inventory-mapping-grid">
            {sortSelectedFirst(
              inventories,
              (inventory) =>
                (inventoryMappings[row.adUnitId] || []).includes(inventory._id),
            ).map((inventory) => {
              const checked = (inventoryMappings[row.adUnitId] || []).includes(inventory._id);
              return (
                <label
                  key={`${row.adUnitId}-${inventory._id}`}
                  className={`inventory-mapping-pill ${checked ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleInventoryMapping(row.adUnitId, inventory._id)
                    }
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
            className={errors.name ? "error" : ""}
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

        {campaign && (
          <>
            <div className="campaign-editor-section-summary form-group form-full-width">
              <div>
                <strong>Ad Units</strong>
                <span>
                  {(campaign.adUnits || []).length} ad units in this campaign
                </span>
              </div>
              <span className="campaign-editor-inline-status">
                Manage Ad Units below
              </span>
            </div>
            {adUnitManagementContent && (
              <div className="campaign-inline-adunit-panel form-group form-full-width">
                {adUnitManagementContent}
              </div>
            )}
            <div className="form-group form-full-width">
              <label>Ad Unit Ad Channel Assignments</label>
              <div className="form-popup-summary">
                <div>
                  <span>{assignmentSummary}</span>
                </div>
                <span className="campaign-editor-inline-status">
                  {assignmentStatus === "success" ? "Selected items are shown first" : "Unavailable"}
                </span>
              </div>
              <div className="campaign-inline-assignment-panel">
                {assignmentContent}
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || assignmentStatus === "loading"}
            aria-busy={submitting}
          >
            {submitting
              ? "Saving..."
              : campaign
                ? "Update Campaign"
                : "Create Campaign"}
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
    </>
  );
}

export default CampaignForm;
