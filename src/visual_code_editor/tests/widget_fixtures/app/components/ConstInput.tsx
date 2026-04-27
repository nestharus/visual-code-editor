type SearchInputProps = {
  value: string;
};

export const SearchInput = ({ value }: SearchInputProps) => {
  return <input value={value} />;
};
