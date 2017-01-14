defmodule App do
  @on_js_load :main

  def main() do
    :console.log Factorial.fact(10000)
  end
end
