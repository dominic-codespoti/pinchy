'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfig, useUpdateConfig } from '../../hooks';
import { ADVANCED_CONFIG_DEFAULTS } from './defaults';
import { formatConfigJson, validateRawConfig } from './raw-config';
import type {
  AdvancedConfigData,
  AdvancedValidationErrors,
  RawConfigRecord,
} from './types';
import {
  buildAdvancedUpdatePayload,
  normalizeAdvancedConfig,
  validateAdvancedConfig,
  validateAdvancedField,
} from './validation';

export function useAdvancedSettingsForm() {
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();

  const [formData, setFormData] = useState<AdvancedConfigData>(ADVANCED_CONFIG_DEFAULTS);
  const [originalData, setOriginalData] = useState<AdvancedConfigData>(ADVANCED_CONFIG_DEFAULTS);
  const [errors, setErrors] = useState<AdvancedValidationErrors>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [rawConfigOpen, setRawConfigOpen] = useState(false);
  const [rawConfigJson, setRawConfigJson] = useState('');
  const [isRawEditing, setIsRawEditing] = useState(false);
  const [rawConfigError, setRawConfigError] = useState<string | null>(null);
  const [hasRawChanges, setHasRawChanges] = useState(false);

  useEffect(() => {
    if (!config) {
      return;
    }

    const normalizedConfig = normalizeAdvancedConfig(config as RawConfigRecord);

    setFormData(normalizedConfig);
    setOriginalData(normalizedConfig);
    setErrors({});
    setHasChanges(false);
    setRawConfigJson(formatConfigJson(config as RawConfigRecord));
    setRawConfigError(null);
    setHasRawChanges(false);
    setIsRawEditing(false);
  }, [config]);

  const saveForm = useCallback(() => {
    const validation = validateAdvancedConfig(formData);
    setErrors(validation.errors);

    if (!validation.isValid) {
      return;
    }

    updateConfig.mutate(buildAdvancedUpdatePayload(formData), {
      onSuccess: () => {
        setOriginalData(formData);
        setHasChanges(false);
      },
    });
  }, [formData, updateConfig]);

  const resetForm = useCallback(() => {
    setFormData(originalData);
    setErrors({});
    setHasChanges(false);
    setShowResetDialog(false);
  }, [originalData]);

  const handleNumberChange = useCallback(
    (field: keyof AdvancedConfigData, value: string) => {
      const numValue = value === '' ? undefined : parseInt(value, 10);

      setFormData((prev) => ({ ...prev, [field]: numValue }));
      setErrors((prev) => ({
        ...prev,
        [field]: validateAdvancedField(field, numValue),
      }));
      setHasChanges(true);
    },
    [],
  );

  const handleTextChange = useCallback((field: keyof AdvancedConfigData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const handleSkillsEnabledChange = useCallback((checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      skills: { ...prev.skills, enabled: checked },
    }));
    setHasChanges(true);
  }, []);

  const handleSkillsListChange = useCallback((field: 'allow' | 'deny', value: string) => {
    const list = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    setFormData((prev) => ({
      ...prev,
      skills: { ...prev.skills, [field]: list },
    }));
    setHasChanges(true);
  }, []);

  const handleRawConfigChange = useCallback((value: string) => {
    const result = validateRawConfig(value);

    setRawConfigJson(value);
    setHasRawChanges(true);
    setRawConfigError(result.valid ? null : result.error || 'Invalid JSON');
  }, []);

  const saveRawConfig = useCallback(() => {
    const result = validateRawConfig(rawConfigJson);

    if (!result.valid || !result.parsed) {
      setRawConfigError(result.error || 'Invalid JSON');
      return;
    }

    updateConfig.mutate(result.parsed, {
      onSuccess: () => {
        setHasRawChanges(false);
        setIsRawEditing(false);
        setRawConfigError(null);
      },
    });
  }, [rawConfigJson, updateConfig]);

  const cancelRawEdit = useCallback(() => {
    if (config) {
      setRawConfigJson(formatConfigJson(config as RawConfigRecord));
    }

    setIsRawEditing(false);
    setRawConfigError(null);
    setHasRawChanges(false);
  }, [config]);

  return {
    config,
    isLoading,
    updateConfig,
    formData,
    errors,
    hasChanges,
    hasValidationErrors: Object.values(errors).some((error) => error !== undefined),
    showResetDialog,
    rawConfigOpen,
    rawConfigJson,
    isRawEditing,
    rawConfigError,
    hasRawChanges,
    setShowResetDialog,
    setRawConfigOpen,
    setIsRawEditing,
    handleNumberChange,
    handleTextChange,
    handleSkillsEnabledChange,
    handleSkillsListChange,
    handleRawConfigChange,
    saveForm,
    resetForm,
    saveRawConfig,
    cancelRawEdit,
  };
}
