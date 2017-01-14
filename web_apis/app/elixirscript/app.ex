defmodule App do
  require JS
  @on_js_load :main

  defp inner_thoughts(%{"id" => "my_div"} = div) do
    :console.log(div.innerHTML)
    div
  end

  defp inner_thoughts(%{"id" => "my_span"} = span) do
    :console.log(span.innerHTML)
    span
  end

  def main() do
    my_div = :document.getElementById("my_div")
    my_span = :document.getElementById("my_span")

    my_elements = [my_div, my_span]

    my_elements
    |> Enum.map(&inner_thoughts(&1))
    |> Enum.each(fn(el) ->
      el.addEventListener("click", fn(event) -> :console.log(event) end, false);
    end)

    date = JS.new Date, []
    :console.log(date)
  end
end
