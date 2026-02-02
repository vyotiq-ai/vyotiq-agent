/**
 * useFormValidation Hook
 * 
 * A hook for managing form validation with support for synchronous and async validators.
 */
import { useState, useCallback, useMemo, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ValidationRule<T> = {
  /** Validation function - returns error message or null if valid */
  validate: (value: T, allValues?: Record<string, unknown>) => string | null | Promise<string | null>;
  /** Optional message override */
  message?: string;
  /** Only validate if this condition is true */
  when?: (value: T, allValues?: Record<string, unknown>) => boolean;
};

export interface FieldConfig<T = unknown> {
  /** Initial value */
  initialValue: T;
  /** Validation rules */
  rules?: ValidationRule<T>[];
  /** Whether to validate on change */
  validateOnChange?: boolean;
  /** Whether to validate on blur */
  validateOnBlur?: boolean;
  /** Transform value before setting */
  transform?: (value: T) => T;
}

export interface FieldState<T = unknown> {
  /** Current value */
  value: T;
  /** Error message (null if valid) */
  error: string | null;
  /** Whether field has been touched (focused and blurred) */
  touched: boolean;
  /** Whether field has been modified */
  dirty: boolean;
  /** Whether field is currently validating (async) */
  isValidating: boolean;
}

export interface UseFormValidationResult<Fields extends Record<string, FieldConfig>> {
  /** Current field values */
  values: { [K in keyof Fields]: Fields[K]['initialValue'] };
  /** Current field errors */
  errors: { [K in keyof Fields]: string | null };
  /** Field touched states */
  touched: { [K in keyof Fields]: boolean };
  /** Whether form has any errors */
  hasErrors: boolean;
  /** Whether form is valid (all fields validated without errors) */
  isValid: boolean;
  /** Whether any field is dirty */
  isDirty: boolean;
  /** Whether any field is validating */
  isValidating: boolean;
  /** Set a field value */
  setValue: <K extends keyof Fields>(field: K, value: Fields[K]['initialValue']) => void;
  /** Set multiple field values */
  setValues: (values: Partial<{ [K in keyof Fields]: Fields[K]['initialValue'] }>) => void;
  /** Set a field error manually */
  setError: <K extends keyof Fields>(field: K, error: string | null) => void;
  /** Validate a single field */
  validateField: <K extends keyof Fields>(field: K) => Promise<string | null>;
  /** Validate all fields */
  validateAll: () => Promise<boolean>;
  /** Mark a field as touched */
  setTouched: <K extends keyof Fields>(field: K, touched?: boolean) => void;
  /** Handle blur event (marks field as touched and validates if configured) */
  handleBlur: <K extends keyof Fields>(field: K) => () => void;
  /** Handle change event (validates if configured) */
  handleChange: <K extends keyof Fields>(field: K) => (value: Fields[K]['initialValue']) => void;
  /** Reset form to initial values */
  reset: () => void;
  /** Reset a single field */
  resetField: <K extends keyof Fields>(field: K) => void;
  /** Get field props for binding to inputs */
  getFieldProps: <K extends keyof Fields>(field: K) => {
    value: Fields[K]['initialValue'];
    onChange: (value: Fields[K]['initialValue']) => void;
    onBlur: () => void;
    error: string | null;
  };
}

// =============================================================================
// Built-in Validators
// =============================================================================

export const validators = {
  required: (message = 'This field is required'): ValidationRule<unknown> => ({
    validate: (value) => {
      if (value === null || value === undefined) return message;
      if (typeof value === 'string' && value.trim() === '') return message;
      if (Array.isArray(value) && value.length === 0) return message;
      return null;
    },
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value) => {
      if (!value || value.length < min) {
        return message ?? `Must be at least ${min} characters`;
      }
      return null;
    },
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value) => {
      if (value && value.length > max) {
        return message ?? `Must be at most ${max} characters`;
      }
      return null;
    },
  }),

  min: (min: number, message?: string): ValidationRule<number> => ({
    validate: (value) => {
      if (typeof value === 'number' && value < min) {
        return message ?? `Must be at least ${min}`;
      }
      return null;
    },
  }),

  max: (max: number, message?: string): ValidationRule<number> => ({
    validate: (value) => {
      if (typeof value === 'number' && value > max) {
        return message ?? `Must be at most ${max}`;
      }
      return null;
    },
  }),

  pattern: (pattern: RegExp, message = 'Invalid format'): ValidationRule<string> => ({
    validate: (value) => {
      if (value && !pattern.test(value)) {
        return message;
      }
      return null;
    },
  }),

  email: (message = 'Invalid email address'): ValidationRule<string> => ({
    validate: (value) => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value && !emailPattern.test(value)) {
        return message;
      }
      return null;
    },
  }),

  url: (message = 'Invalid URL'): ValidationRule<string> => ({
    validate: (value) => {
      try {
        if (value) {
          new URL(value);
        }
        return null;
      } catch {
        return message;
      }
    },
  }),

  matches: <T>(otherField: string, message = 'Fields do not match'): ValidationRule<T> => ({
    validate: (value, allValues) => {
      if (allValues && value !== allValues[otherField]) {
        return message;
      }
      return null;
    },
  }),

  custom: <T>(fn: (value: T, allValues?: Record<string, unknown>) => boolean, message: string): ValidationRule<T> => ({
    validate: (value, allValues) => {
      if (!fn(value, allValues)) {
        return message;
      }
      return null;
    },
  }),
};

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFormValidation<Fields extends Record<string, FieldConfig>>(
  fieldsConfig: Fields
): UseFormValidationResult<Fields> {
  type FieldKeys = keyof Fields;
  type ValuesType = { [K in FieldKeys]: Fields[K]['initialValue'] };
  type ErrorsType = { [K in FieldKeys]: string | null };
  type TouchedType = { [K in FieldKeys]: boolean };

  // Initialize state from config
  const getInitialValues = useCallback((): ValuesType => {
    const values = {} as ValuesType;
    for (const key in fieldsConfig) {
      values[key as FieldKeys] = fieldsConfig[key].initialValue;
    }
    return values;
  }, [fieldsConfig]);

  const getInitialErrors = useCallback((): ErrorsType => {
    const errors = {} as ErrorsType;
    for (const key in fieldsConfig) {
      errors[key as FieldKeys] = null;
    }
    return errors;
  }, [fieldsConfig]);

  const getInitialTouched = useCallback((): TouchedType => {
    const touched = {} as TouchedType;
    for (const key in fieldsConfig) {
      touched[key as FieldKeys] = false;
    }
    return touched;
  }, [fieldsConfig]);

  const [values, setValuesState] = useState<ValuesType>(getInitialValues);
  const [errors, setErrorsState] = useState<ErrorsType>(getInitialErrors);
  const [touched, setTouchedState] = useState<TouchedType>(getInitialTouched);
  const [validatingFields, setValidatingFields] = useState<Set<FieldKeys>>(new Set());

  const initialValuesRef = useRef(getInitialValues());

  // Computed states
  const hasErrors = useMemo(() => Object.values(errors).some(e => e !== null), [errors]);
  const isValidating = validatingFields.size > 0;
  const isDirty = useMemo(() => {
    for (const key in values) {
      if (values[key] !== initialValuesRef.current[key]) {
        return true;
      }
    }
    return false;
  }, [values]);

  const isValid = useMemo(() => {
    // All fields must be touched and have no errors
    for (const key in fieldsConfig) {
      if (!touched[key as FieldKeys] || errors[key as FieldKeys] !== null) {
        return false;
      }
    }
    return true;
  }, [fieldsConfig, touched, errors]);

  // Validate a single field
  const validateField = useCallback(async <K extends FieldKeys>(field: K): Promise<string | null> => {
    const config = fieldsConfig[field];
    if (!config.rules || config.rules.length === 0) {
      return null;
    }

    setValidatingFields(prev => new Set(prev).add(field));

    try {
      for (const rule of config.rules) {
        // Check condition
        if (rule.when && !rule.when(values[field], values as Record<string, unknown>)) {
          continue;
        }

        const result = await rule.validate(values[field], values as Record<string, unknown>);
        if (result) {
          const errorMessage = rule.message ?? result;
          setErrorsState((prev): ErrorsType => ({ ...prev, [field]: errorMessage }));
          return errorMessage;
        }
      }

      setErrorsState((prev): ErrorsType => ({ ...prev, [field]: null }));
      return null;
    } finally {
      setValidatingFields(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  }, [fieldsConfig, values]);

  // Validate all fields
  const validateAll = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      (Object.keys(fieldsConfig) as FieldKeys[]).map(field => validateField(field))
    );
    return results.every(r => r === null);
  }, [fieldsConfig, validateField]);

  // Set a single value
  const setValue = useCallback(<K extends FieldKeys>(field: K, value: Fields[K]['initialValue']) => {
    const config = fieldsConfig[field];
    const transformedValue = config.transform ? config.transform(value) : value;
    
    setValuesState(prev => ({ ...prev, [field]: transformedValue }));

    if (config.validateOnChange) {
      // Validate after state update
      setTimeout(() => validateField(field), 0);
    }
  }, [fieldsConfig, validateField]);

  // Set multiple values
  const setValues = useCallback((newValues: Partial<ValuesType>) => {
    setValuesState(prev => {
      const next = { ...prev };
      for (const key in newValues) {
        const config = fieldsConfig[key as FieldKeys];
        const value = newValues[key as FieldKeys];
        next[key as FieldKeys] = config?.transform ? config.transform(value) : value;
      }
      return next;
    });
  }, [fieldsConfig]);

  // Set a single error
  const setError = useCallback(<K extends FieldKeys>(field: K, error: string | null) => {
    setErrorsState(prev => ({ ...prev, [field]: error }));
  }, []);

  // Set touched state
  const setTouched = useCallback(<K extends FieldKeys>(field: K, isTouched = true) => {
    setTouchedState(prev => ({ ...prev, [field]: isTouched }));
  }, []);

  // Handle blur
  const handleBlur = useCallback(<K extends FieldKeys>(field: K) => () => {
    setTouched(field, true);
    const config = fieldsConfig[field];
    if (config.validateOnBlur !== false) {
      validateField(field);
    }
  }, [fieldsConfig, setTouched, validateField]);

  // Handle change
  const handleChange = useCallback(<K extends FieldKeys>(field: K) => (value: Fields[K]['initialValue']) => {
    setValue(field, value);
  }, [setValue]);

  // Reset form
  const reset = useCallback(() => {
    setValuesState(getInitialValues());
    setErrorsState(getInitialErrors());
    setTouchedState(getInitialTouched());
    setValidatingFields(new Set());
  }, [getInitialValues, getInitialErrors, getInitialTouched]);

  // Reset a single field
  const resetField = useCallback(<K extends FieldKeys>(field: K) => {
    setValuesState((prev): ValuesType => ({ ...prev, [field]: fieldsConfig[field].initialValue }));
    setErrorsState((prev): ErrorsType => ({ ...prev, [field]: null }));
    setTouchedState((prev): TouchedType => ({ ...prev, [field]: false }));
  }, [fieldsConfig]);

  // Get field props
  const getFieldProps = useCallback(<K extends FieldKeys>(field: K) => ({
    value: values[field],
    onChange: handleChange(field),
    onBlur: handleBlur(field),
    error: errors[field],
  }), [values, handleChange, handleBlur, errors]);

  return {
    values,
    errors,
    touched,
    hasErrors,
    isValid,
    isDirty,
    isValidating,
    setValue,
    setValues,
    setError,
    validateField,
    validateAll,
    setTouched,
    handleBlur,
    handleChange,
    reset,
    resetField,
    getFieldProps,
  };
}

export default useFormValidation;
