defmodule ReactUI do
  @load_only true

  defmacro __using__(_) do
    quote do
      JS.import React, "react"
      JS.import ReactDOM, "react-dom"
      import ReactUI
    end
  end

  @external_resource tags_path = Path.join([__DIR__, "tags.txt"])

  @tags (for line <- File.stream!(tags_path, [], :line) do
    line |> String.strip |> String.to_atom
  end)

  for tag <- @tags do
    @doc """
    Defines a macro for the html element, #{tag}
    """
    defmacro unquote(tag)(attrs, do: inner) do
      tag = Atom.to_string(unquote(tag))
      { inner, attributes } = do_tag(inner, attrs)

      quote do
        React.createElement(unquote(tag), unquote(attributes), unquote_splicing(inner))
      end
    end

    defmacro unquote(tag)(attrs \\ []) do
      tag = Atom.to_string(unquote(tag))

      { inner, attributes } = Dict.pop(attrs, :do)
      { inner, attributes } = do_tag(inner, attributes)

      quote do
        React.createElement(unquote(tag), unquote(attributes), unquote_splicing(inner))
      end
    end
  end

  defp do_tag(inner, attributes) do
    inner = case inner do
      {:__block__, [], params} ->
        params
      nil ->
        []
      x ->
        [x]
    end

    attributes = config_to_map(attributes)

    {inner, attributes}
  end

  defp config_to_map(config) do
    config = Enum.map(config, fn({key, value}) ->
    if is_atom(key) do
      {Atom.to_string(key), value}
    else
      {key, value}
    end
    end)

    {:%{}, [], config}
  end

end
