const firstNonEmptyString = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim();

export const getApiErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData.trim();
  }

  const validationMessage = Array.isArray(responseData?.errors)
    ? responseData.errors
        .map((entry) =>
          typeof entry === "string" ? entry : entry?.message || entry?.msg,
        )
        .find((message) => typeof message === "string" && message.trim())
    : null;

  const serverMessage = firstNonEmptyString(
    responseData?.error,
    responseData?.message,
    responseData?.details?.message,
    validationMessage,
  );
  if (serverMessage) return serverMessage;

  if (!error?.response && error?.message === "Network Error") {
    return "Unable to connect to the server. Check your connection and try again.";
  }

  if (error?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }

  return firstNonEmptyString(error?.message, fallbackMessage) || "Something went wrong. Please try again.";
};

