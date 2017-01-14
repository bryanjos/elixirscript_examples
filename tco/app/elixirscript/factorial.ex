defmodule Factorial do

  def fact(num) do
    do_fact(num, 1)
  end

  defp do_fact(0, acc), do: acc
  defp do_fact(num, acc), do: do_fact(num - 1, acc * num)
end