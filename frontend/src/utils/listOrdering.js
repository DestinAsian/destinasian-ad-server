const listCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

const defaultGetLabel = (item) => item?.name || item?.label || item?.email || "";

export const compareByLabel = (left, right, getLabel = defaultGetLabel) => {
  const labelComparison = listCollator.compare(
    String(getLabel(left) || ""),
    String(getLabel(right) || ""),
  );

  if (labelComparison !== 0) return labelComparison;

  return listCollator.compare(
    String(left?._id || left?.id || ""),
    String(right?._id || right?.id || ""),
  );
};

export const sortAlphabetically = (items = [], getLabel = defaultGetLabel) =>
  [...items].sort((left, right) => compareByLabel(left, right, getLabel));

export const sortSelectedFirst = (
  items = [],
  isSelected = () => false,
  getLabel = defaultGetLabel,
) =>
  [...items].sort((left, right) => {
    const selectedDifference = Number(isSelected(right)) - Number(isSelected(left));
    if (selectedDifference !== 0) return selectedDifference;
    return compareByLabel(left, right, getLabel);
  });
