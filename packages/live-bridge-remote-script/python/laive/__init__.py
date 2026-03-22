from __future__ import absolute_import, print_function, unicode_literals

from .control_surface import LaiveControlSurface


def create_instance(c_instance):
    return LaiveControlSurface(c_instance)
